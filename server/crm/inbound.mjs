import Crm from "../../src/domain/crm.mjs";
import Session from "../../src/domain/session.mjs";
const labels = {
  image: "Imagem recebida",
  audio: "Mensagem de voz recebida",
  video: "Vídeo recebido",
  document: "Documento recebido",
  sticker: "Figurinha recebida",
  location: "Localização recebida",
  contacts: "Contato recebido",
  reaction: "Reação recebida",
  unsupported: "Mensagem não suportada",
};
export function inboundText(message) {
  if (message.type === "text")
    return (
      String(message.text?.body || "").slice(0, 16000) ||
      "[Mensagem de texto vazia]"
    );
  if (message.type === "button")
    return String(message.button?.text || "[Botão selecionado]").slice(0, 4000);
  if (message.type === "interactive")
    return String(
      message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        "[Resposta interativa]",
    ).slice(0, 4000);
  const caption = message[message.type]?.caption;
  return (
    "[" +
    (labels[message.type] || "Mensagem recebida") +
    "]" +
    (caption ? "\n" + String(caption).slice(0, 4000) : "")
  );
}
async function payloadOf(db, deliveryId) {
  const parts = await db
    .prepare(
      "SELECT payload FROM delivery_parts WHERE delivery_id=? ORDER BY part_index",
    )
    .bind(deliveryId)
    .all();
  const chunks = parts.results.map((p) => new Uint8Array(p.payload));
  const raw = new Uint8Array(chunks.reduce((sum, p) => sum + p.byteLength, 0));
  let offset = 0;
  for (const part of chunks) {
    raw.set(part, offset);
    offset += part.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(raw));
}
export function appendInbound(state, value, message, connection, receivedAt) {
  if (!message || typeof message.id !== "string") return null;
  const sender = String(message.from || message.from_user_id || "");
  if (!sender || sender.length > 256) return null;
  const profile = value.contacts?.find(
    (c) =>
      c.wa_id === sender || c.user_id === sender || c.from_user_id === sender,
  );
  const name =
    String(profile?.profile?.name || sender)
      .trim()
      .slice(0, 100) || sender;
  const phone = /^\d{8,15}$/.test(sender) ? "+" + sender : "";
  let contact = state.contacts.find(
    (c) =>
      c.waPhoneNumberId === connection.phone_number_id &&
      c.waSenderId === sender,
  );
  if (!contact && phone)
    contact = state.contacts.find(
      (c) => !c.waPhoneNumberId && Crm.phoneKey(c.phone) === sender,
    );
  if (!contact) {
    const id = Math.max(
      Date.now(),
      ...state.contacts.map((c) => Number(c.id) + 1),
    );
    contact = {
      id,
      name,
      phone,
      company: "",
      email: "",
      tag: "Cliente",
      sector: state.sectors.includes(connection.sector)
        ? connection.sector
        : state.sectors[0],
      initials: name
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join(""),
      color: "green",
      favorite: false,
      assigneeId: null,
      sessionState: "closed",
      sessionId: "wa-" + id,
      lastInboundAt: null,
      createdAt: receivedAt,
      source: "whatsapp",
    };
    state.contacts.push(contact);
  }
  Object.assign(contact, {
    waPhoneNumberId: connection.phone_number_id,
    waAccountId: connection.account_id,
    waSenderId: sender,
  });
  const list = (state.messages[contact.id] ??= []);
  if (list.some((m) => m.id === message.id && m.source === "whatsapp"))
    return {
      contactId: contact.id,
      messageAt: list.find((m) => m.id === message.id).createdAt,
    };
  const receivedMs = Date.parse(receivedAt);
  const supplied = Number(message.timestamp) * 1000;
  const time =
    Number.isFinite(supplied) && supplied > 0 && supplied <= receivedMs + 300000
      ? supplied
      : receivedMs;
  const text = inboundText(message),
    last = Date.parse(contact.lastInboundAt);
  let record;
  if (!Number.isFinite(last) || time >= last)
    record = Session.receive(contact, text, time);
  else
    record = {
      direction: "inbound",
      text,
      senderName: contact.name,
      createdAt: new Date(time).toISOString(),
      sessionId: contact.sessionId,
    };
  Object.assign(record, {
    id: message.id,
    source: "whatsapp",
    waPhoneNumberId: connection.phone_number_id,
    waType: message.type || "unknown",
  });
  if (message.context?.id)
    record.replyTo = {
      messageId: message.context.id,
      text: "Mensagem anterior do WhatsApp",
      senderName: contact.name,
    };
  list.push(record);
  list.sort(
    (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
  );
  Session.expire([contact], Date.now());
  return { contactId: contact.id, messageAt: record.createdAt };
}
export async function syncInbound(db, workspaceId) {
  const connections = (
    await db
      .prepare("SELECT * FROM klivo_whatsapp_connections WHERE workspace_id=?")
      .bind(workspaceId)
      .all()
  ).results;
  if (!connections.length) return { connected: false, lastMessageAt: null };
  let error = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const workspace = await db
      .prepare("SELECT state_json,revision FROM klivo_workspaces WHERE id=?")
      .bind(workspaceId)
      .first();
    const candidates = (
      await db
        .prepare(
          "SELECT e.* FROM events e WHERE e.kind='message' AND e.account_id IN (SELECT account_id FROM klivo_whatsapp_connections WHERE workspace_id=?) AND NOT EXISTS (SELECT 1 FROM klivo_inbox_receipts r WHERE r.workspace_id=? AND r.event_id=e.id) ORDER BY e.received_at,e.id LIMIT 20",
        )
        .bind(workspaceId, workspaceId)
        .all()
    ).results;
    if (!candidates.length) break;
    const state = JSON.parse(workspace.state_json),
      cache = new Map(),
      receipts = [],
      decoded = [];
    for (const event of candidates) {
      let payload = cache.get(event.delivery_id);
      if (!payload) {
        payload = await payloadOf(db, event.delivery_id);
        cache.set(event.delivery_id, payload);
      }
      const path = event.payload_path.match(
        /^\$\.entry\[(\d+)\]\.changes\[(\d+)\]\.value\.messages\[(\d+)\]$/,
      );
      const value = path
        ? payload.entry?.[Number(path[1])]?.changes?.[Number(path[2])]?.value
        : null;
      const connection = connections.find(
        (c) =>
          c.account_id === event.account_id &&
          c.phone_number_id === value?.metadata?.phone_number_id,
      );
      decoded.push({
        event,
        value,
        connection,
        message: path ? value?.messages?.[Number(path[3])] : null,
      });
    }
    decoded.sort(
      (a, b) =>
        (Number(a.message?.timestamp) * 1000 ||
          Date.parse(a.event.received_at)) -
        (Number(b.message?.timestamp) * 1000 ||
          Date.parse(b.event.received_at)),
    );
    for (const { event, value, connection, message } of decoded) {
      const result = connection
        ? appendInbound(state, value, message, connection, event.received_at)
        : null;
      receipts.push({
        eventId: event.id,
        contactId: result?.contactId ?? null,
        messageAt: result?.messageAt ?? null,
        ignoredReason: result
          ? null
          : connection
            ? "invalid_sender"
            : "different_phone",
      });
    }
    const snapshot = JSON.stringify(state);
    if (new TextEncoder().encode(snapshot).byteLength > 900000) {
      error =
        "Há mensagens aguardando sincronização: o espaço atingiu o limite desta versão. Os eventos originais estão preservados.";
      break;
    }
    const now = new Date().toISOString();
    const result = await db.batch([
      db
        .prepare(
          "UPDATE klivo_workspaces SET state_json=?,revision=revision+1 WHERE id=? AND revision=?",
        )
        .bind(snapshot, workspaceId, workspace.revision),
      db
        .prepare(
          "INSERT INTO klivo_inbox_receipts (workspace_id,event_id,contact_id,projected_at,message_at,ignored_reason) SELECT ?,json_extract(value,'$.eventId'),json_extract(value,'$.contactId'),?,json_extract(value,'$.messageAt'),json_extract(value,'$.ignoredReason') FROM json_each(?) WHERE changes()=1",
        )
        .bind(workspaceId, now, JSON.stringify(receipts)),
    ]);
    if (result[0].meta.changes) break;
  }
  const last = await db
    .prepare(
      "SELECT MAX(message_at) AS stamp FROM klivo_inbox_receipts WHERE workspace_id=? AND ignored_reason IS NULL",
    )
    .bind(workspaceId)
    .first();
  return { connected: true, lastMessageAt: last?.stamp || null, error };
}
