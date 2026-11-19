import { approvedTemplates } from "./templates.mjs";
import { compileMetaTemplate } from "../../src/domain/whatsapp-template.mjs";
import Crm from "../../src/domain/crm.mjs";
import Session from "../../src/domain/session.mjs";
import { quoteMessage } from "../../src/services/chat.mjs";
import { digest } from "./auth.mjs";
import { payloadOf } from "./inbound.mjs";
import {
  blockedFor,
  templatePermissionError,
  grantFor,
} from "../../src/domain/communication.mjs";

// Meta may omit the ninth mobile digit in Brazilian inbound wa_id values.
// Use the configured test recipient only when both forms identify that same phone.
export function replyRecipient(sender, configured) {
  if (
    /^55\d{10}$/.test(sender) &&
    /^55\d{2}9\d{8}$/.test(configured || "") &&
    sender.slice(0, 4) + "9" + sender.slice(4) === configured
  )
    return configured;
  return sender;
}
export function sendError(code) {
  return (
    {
      130497:
        "A Meta bloqueou o envio para o país deste destinatário (130497).",
      190: "O token da Meta expirou ou foi revogado (190).",
      131030:
        "Este destinatário não está autorizado na lista de testes da Meta (131030).",
      131047:
        "A janela de 24 horas está fechada (131047). Aguarde uma nova mensagem do cliente.",
      141006: "A Meta bloqueou o envio por um problema no pagamento (141006).",
      10: "A Meta não autorizou o envio. Confira as permissões (10).",
    }[code] ||
    (code
      ? "A Meta recusou a mensagem. Código: " + code + "."
      : "A Meta recusou a mensagem.")
  );
}
const fail = (error, status = 400) => ({ error, status });
export async function sendReply(env, c, user, body, fetcher = fetch) {
  if (!body || typeof body !== "object")
    return fail("Dados da mensagem inválidos.");
  if (body.workspaceId !== c.workspace.id)
    return fail("A empresa ativa mudou. Atualize a página.", 409);
  const isTemplate = body.type === "template";
  if (
    !/^[a-f0-9-]{36}$/.test(body.operationId || "") ||
    (isTemplate
      ? typeof body.templateId !== "string" ||
        !body.values ||
        typeof body.values !== "object" ||
        Array.isArray(body.values)
      : typeof body.text !== "string" ||
        !body.text.trim() ||
        body.text.length > 4000)
  )
    return fail("Informe um texto de até 4000 caracteres.");
  const contact = c.state.contacts.find(
    (x) => String(x.id) === String(body.contactId),
  );
  const actor = c.state.team.find((x) => x.id === user.id);
  if (!contact || !Crm.canViewContact(actor, contact))
    return fail("Você não tem acesso a esta conversa.", 403);
  const requestHash = await digest(
    JSON.stringify([
      String(contact.id),
      isTemplate
        ? ["template", body.templateId, body.values, body.consent]
        : ["text", body.text.trim(), body.replyId || null],
    ]),
  );
  const previous = await env.DB.prepare(
    "SELECT * FROM klivo_outbox WHERE workspace_id=? AND operation_id=?",
  )
    .bind(c.workspace.id, body.operationId)
    .first();
  if (previous) {
    if (previous.user_id !== user.id || previous.request_hash !== requestHash)
      return fail("Esta operação já foi utilizada.", 409);
    return resultOf(previous);
  }
  if (!isTemplate && blockedFor(c.state, contact))
    return fail("Envio bloqueado por pedido de interrupção do cliente.", 403);
  const pendingInbound = await env.DB.prepare(
    "SELECT 1 AS pending FROM events e WHERE e.kind='message' AND e.account_id IN (SELECT account_id FROM klivo_whatsapp_connections WHERE workspace_id=?) AND NOT EXISTS (SELECT 1 FROM klivo_inbox_receipts r WHERE r.workspace_id=? AND r.event_id=e.id) LIMIT 1",
  )
    .bind(c.workspace.id, c.workspace.id)
    .first();
  if (pendingInbound)
    return fail(
      "Há mensagens recebidas aguardando atualização. Atualize antes de enviar.",
      409,
    );
  if (
    !isTemplate &&
    (!Session.canReply(contact) || contact.sessionState !== "open")
  )
    return fail(
      "A janela de 24 horas terminou. Aguarde uma mensagem do cliente.",
    );
  if (contact.assigneeId && contact.assigneeId !== user.id)
    return fail("Assuma o atendimento antes de responder.", 403);
  const connection = await env.DB.prepare(
    "SELECT * FROM klivo_whatsapp_connections WHERE workspace_id=? AND phone_number_id=? AND account_id=?",
  )
    .bind(
      c.workspace.id,
      contact.waPhoneNumberId || "",
      contact.waAccountId || "",
    )
    .first();
  if (
    !connection ||
    connection.phone_number_id !== env.WHATSAPP_PHONE_NUMBER_ID ||
    !contact.waSenderId ||
    !/^\d{8,15}$/.test(contact.waSenderId)
  )
    return fail(
      "Esta conversa não tem um destinatário WhatsApp válido conectado.",
      403,
    );
  if (!env.META_ACCESS_TOKEN)
    return fail("O token do WhatsApp não está configurado.", 503);
  if (new TextEncoder().encode(c.workspace.state_json).byteLength > 880000)
    return fail(
      "O histórico está próximo do limite. Libere espaço antes de enviar.",
      413,
    );
  let compiled, template;
  if (isTemplate) {
    if (body.consent !== true)
      return fail("Confirme que o cliente autorizou este contato.");
    try {
      template = (
        await approvedTemplates(env, connection.account_id, fetcher)
      ).find((t) => t.id === body.templateId);
      if (!template)
        return fail(
          "O modelo não está mais aprovado ou não pertence a esta conta.",
        );
      const permissionError = templatePermissionError(
        c.state,
        contact,
        template.category,
      );
      if (permissionError) return fail(permissionError, 403);
      compiled = compileMetaTemplate(template, body.values);
    } catch (error) {
      return fail(error.message);
    }
  }
  const now = new Date().toISOString();
  const outbound = {
    id: "out-" + body.operationId,
    direction: "outbound",
    source: "whatsapp",
    text: isTemplate ? compiled.text : body.text.trim(),
    signedText: isTemplate
      ? compiled.text
      : actor.name + ":\n" + body.text.trim(),
    senderId: user.id,
    senderName: actor.name,
    createdAt: now,
    sessionId: contact.sessionId,
    type: isTemplate ? "template" : "text",
    ...(isTemplate
      ? {
          templateName: template.name,
          templateLanguage: template.language,
          templateConsent: true,
          authorizationId: grantFor(c.state, contact, template.category).id,
          authorizationScope: template.category,
        }
      : {}),
    delivery: "sending",
  };
  if (!isTemplate && outbound.signedText.length > 4096)
    return fail("O texto com a assinatura ultrapassa 4096 caracteres.");
  let context;
  if (!isTemplate && body.replyId) {
    const source = (c.state.messages[contact.id] || []).find(
      (x) => x.id === body.replyId,
    );
    if (
      !source ||
      source.source !== "whatsapp" ||
      source.direction === "system" ||
      (source.direction === "outbound" && !source.waMessageId)
    )
      return fail("A mensagem citada não está disponível no WhatsApp.");
    context = { message_id: source.waMessageId || source.id };
    outbound.replyTo = quoteMessage(source, body.replyId);
  }
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO klivo_outbox (workspace_id,operation_id,user_id,contact_id,phone_number_id,account_id,request_hash,message_json,status,created_at) SELECT ?,?,?,?,?,?,?,?,'sending',? WHERE EXISTS (SELECT 1 FROM klivo_workspaces WHERE id=? AND revision=?) AND EXISTS (SELECT 1 FROM klivo_memberships WHERE workspace_id=? AND user_id=? AND role=? AND sectors_json=? AND capabilities_json=?) AND (SELECT COUNT(*) FROM klivo_outbox WHERE workspace_id=? AND created_at>?)<20",
  )
    .bind(
      c.workspace.id,
      body.operationId,
      user.id,
      String(contact.id),
      connection.phone_number_id,
      connection.account_id,
      requestHash,
      JSON.stringify(outbound),
      now,
      c.workspace.id,
      c.workspace.revision,
      c.workspace.id,
      user.id,
      c.member.role,
      c.member.sectors_json,
      c.member.capabilities_json,
      c.workspace.id,
      new Date(Date.now() - 60000).toISOString(),
    )
    .run();
  if (!inserted.meta.changes)
    return fail(
      "Outra operação alterou esta conversa ou o limite de envio foi atingido. Atualize antes de tentar novamente.",
      409,
    );
  // Reserve before the external side effect. An uncertain request is never resent automatically.
  try {
    const response = await fetcher(
      "https://graph.facebook.com/v27.0/" +
        connection.phone_number_id +
        "/messages",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.META_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: replyRecipient(contact.waSenderId, env.WHATSAPP_TEST_RECIPIENT),
          ...(isTemplate
            ? { type: "template", template: compiled.payload }
            : { type: "text", text: { body: outbound.signedText } }),
          ...(context ? { context } : {}),
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    const result = await response.json();
    const id = result.messages?.[0]?.id;
    const code = Number.isInteger(result.error?.code)
      ? result.error.code
      : null;
    const status =
      response.ok && typeof id === "string"
        ? "accepted"
        : response.ok
          ? "unknown"
          : "failed";
    await env.DB.prepare(
      "UPDATE klivo_outbox SET status=?,message_id=?,error_code=? WHERE workspace_id=? AND operation_id=?",
    )
      .bind(
        status,
        typeof id === "string" ? id : null,
        code,
        c.workspace.id,
        body.operationId,
      )
      .run();
    return resultOf({ status, message_id: id, error_code: code });
  } catch {
    await env.DB.prepare(
      "UPDATE klivo_outbox SET status='unknown' WHERE workspace_id=? AND operation_id=? AND status='sending'",
    )
      .bind(c.workspace.id, body.operationId)
      .run();
    return resultOf({ status: "unknown" });
  }
}
function resultOf(row) {
  if (row.status === "failed") return fail(sendError(row.error_code), 502);
  if (row.status === "unknown" || row.status === "sending")
    return fail(
      "Não foi possível confirmar o envio. Não reenviamos automaticamente para evitar duplicidade. Confira o histórico antes de uma nova tentativa.",
      409,
    );
  return { status: 200, delivery: row.status, id: row.message_id };
}

export async function syncOutbound(db, workspaceId) {
  // Process delivery callbacks separately from accepting an API request.
  const events = (
    await db
      .prepare(
        "SELECT e.* FROM events e WHERE e.kind='status' AND e.account_id IN (SELECT account_id FROM klivo_whatsapp_connections WHERE workspace_id=?) AND NOT EXISTS (SELECT 1 FROM klivo_outbox_events r WHERE r.workspace_id=? AND r.event_id=e.id) ORDER BY e.received_at,e.id LIMIT 50",
      )
      .bind(workspaceId, workspaceId)
      .all()
  ).results;
  const inflight = await db
    .prepare(
      "SELECT 1 AS found FROM klivo_outbox WHERE workspace_id=? AND status='sending' LIMIT 1",
    )
    .bind(workspaceId)
    .first();
  const cache = new Map();
  for (const event of events) {
    const payload =
      cache.get(event.delivery_id) || (await payloadOf(db, event.delivery_id));
    cache.set(event.delivery_id, payload);
    const path = event.payload_path.match(
      /^\$\.entry\[(\d+)\]\.changes\[(\d+)\]\.value\.statuses\[(\d+)\]$/,
    );
    const value = path
      ? payload.entry?.[+path[1]]?.changes?.[+path[2]]?.value
      : null;
    const item = path ? value?.statuses?.[+path[3]] : null;
    if (item && ["sent", "delivered", "read", "failed"].includes(item.status)) {
      const row = await db
        .prepare(
          "SELECT status FROM klivo_outbox WHERE workspace_id=? AND message_id=? AND account_id=? AND phone_number_id=?",
        )
        .bind(
          workspaceId,
          item.id,
          event.account_id,
          value.metadata?.phone_number_id || "",
        )
        .first();
      if (!row && inflight) continue;
      const rank = {
        sending: 0,
        unknown: 0,
        accepted: 1,
        sent: 2,
        failed: 3,
        delivered: 4,
        read: 5,
      };
      if (row && rank[item.status] > (rank[row.status] ?? 0))
        await db
          .prepare(
            "UPDATE klivo_outbox SET status=?,error_code=? WHERE workspace_id=? AND message_id=?",
          )
          .bind(
            item.status,
            Number.isInteger(item.errors?.[0]?.code)
              ? item.errors[0].code
              : null,
            workspaceId,
            item.id,
          )
          .run();
    }
    await db
      .prepare(
        "INSERT OR IGNORE INTO klivo_outbox_events (workspace_id,event_id) VALUES (?,?)",
      )
      .bind(workspaceId, event.id)
      .run();
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const w = await db
      .prepare("SELECT state_json,revision FROM klivo_workspaces WHERE id=?")
      .bind(workspaceId)
      .first();
    const state = JSON.parse(w.state_json);
    const rows = (
      await db
        .prepare(
          "SELECT * FROM klivo_outbox WHERE workspace_id=? ORDER BY created_at,operation_id",
        )
        .bind(workspaceId)
        .all()
    ).results;
    let changed = false;
    for (const row of rows) {
      const c = state.contacts.find((x) => String(x.id) === row.contact_id);
      if (!c) continue;
      const message = JSON.parse(row.message_json);
      Object.assign(message, {
        delivery: row.status,
        waMessageId: row.message_id || null,
        deliveryError:
          row.status === "failed" ? sendError(row.error_code) : null,
      });
      const list = (state.messages[c.id] ??= []);
      const existing = list.findIndex((x) => x.id === message.id);
      if (existing < 0) {
        list.push(message);
        changed = true;
      } else if (JSON.stringify(list[existing]) !== JSON.stringify(message)) {
        list[existing] = message;
        changed = true;
      }
      // Only confirmed delivery clears the waiting-for-reply state.
      if (
        message.type !== "template" &&
        ["sent", "delivered", "read"].includes(row.status) &&
        Date.parse(row.created_at) >= Date.parse(c.lastInboundAt) &&
        (!c.lastOutboundAt ||
          Date.parse(c.lastOutboundAt) < Date.parse(row.created_at))
      ) {
        c.lastOutboundAt = row.created_at;
        c.waitingSince = null;
        c.queueState = "Em atendimento";
        c.preview = message.text;
        changed = true;
      }
    }
    if (!changed) return;
    const text = JSON.stringify(state);
    if (new TextEncoder().encode(text).byteLength > 900000) return;
    const update = await db
      .prepare(
        "UPDATE klivo_workspaces SET state_json=?,revision=revision+1 WHERE id=? AND revision=?",
      )
      .bind(text, workspaceId, w.revision)
      .run();
    if (update.meta.changes) return;
  }
}
