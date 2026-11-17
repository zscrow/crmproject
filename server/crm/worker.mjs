import { timingSafeEqual } from "node:crypto";
import { webhookEvents } from "../webhook-protocol.mjs";
import { authRoute, sessionUser } from "./auth.mjs";
import { workspaceRoute } from "./workspaces.mjs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export function authorized(request, key) {
  if (!key || key.length < 32) return false;
  const encoder = new TextEncoder();
  const expected = encoder.encode(`Bearer ${key}`),
    actual = encoder.encode(request.headers.get("Authorization") || "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function recentEvents(db, phoneId) {
  const rows = await db
    .prepare(
      "SELECT id, received_at FROM deliveries ORDER BY received_at DESC, id DESC LIMIT 10",
    )
    .all();
  const events = [],
    seen = new Set();
  for (const delivery of rows.results) {
    const parts = await db
      .prepare(
        "SELECT payload FROM delivery_parts WHERE delivery_id = ? ORDER BY part_index",
      )
      .bind(delivery.id)
      .all();
    const raw = parts.results.flatMap((p) =>
      Array.from(new Uint8Array(p.payload)),
    );
    const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(raw)));
    for (const event of webhookEvents(payload)) {
      const match = event.payloadPath.match(/entry\[(\d+)\].changes\[(\d+)\]/);
      const value =
        payload.entry[Number(match[1])].changes[Number(match[2])].value;
      if (phoneId && value.metadata?.phone_number_id !== phoneId) continue;
      if (seen.has(event.identity)) continue;
      seen.add(event.identity);
      const item = event.payload;
      events.push({
        id: item.id || delivery.id,
        kind: event.kind,
        errorCodes: (Array.isArray(item.errors) ? item.errors : [])
          .map((error) => error.code)
          .filter(Number.isInteger),
        phone: item.from || item.from_user_id || item.recipient_id || "",
        text:
          item.text?.body ||
          (event.kind === "status"
            ? item.status
            : `[${item.type || event.field}]`),
        receivedAt: delivery.received_at,
        timestamp: item.timestamp,
        phoneId: value.metadata?.phone_number_id || "",
      });
    }
  }
  return events.slice(0, 100);
}
export function makeMessage(input, recipient) {
  if (!/^\d{8,15}$/.test(recipient || ""))
    throw new Error("Configure o destinatário de teste no servidor.");
  if (input.type === "template")
    return {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    };
  if (
    input.type !== "text" ||
    typeof input.text !== "string" ||
    !input.text.trim() ||
    input.text.length > 4096
  )
    throw new Error("Informe um texto entre 1 e 4096 caracteres.");
  return {
    messaging_product: "whatsapp",
    to: recipient,
    type: "text",
    text: { body: input.text.trim() },
  };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (url.pathname.startsWith("/api/auth/"))
        return await authRoute(request, env);
      const user = await sessionUser(request, env.DB);
      if (!user)
        return json({ error: "Entre na sua conta para continuar." }, 401);
      if (url.pathname.startsWith('/api/workspace')) return await workspaceRoute(request,env,user);
      if (user.role !== "owner")
        return json(
          {
            error:
              "Este painel de testes é exclusivo do administrador do Klivo.",
          },
          403,
        );
    } catch {
      return json({ error: "Não foi possível verificar sua sessão." }, 503);
    }
    if (
      request.method !== "GET" &&
      request.headers.get("Origin") !== url.origin
    )
      return json({ error: "Origem não permitida." }, 403);
    try {
      if (url.pathname === "/api/whatsapp/status" && request.method === "GET") {
        await env.DB.prepare("SELECT id FROM deliveries LIMIT 1").first();
        return json({
          database: true,
          sendingConfigured: Boolean(
            env.META_ACCESS_TOKEN &&
            /^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID || "") &&
            /^\d{8,15}$/.test(env.WHATSAPP_TEST_RECIPIENT || ""),
          ),
          phoneId: env.WHATSAPP_PHONE_NUMBER_ID || "",
          recipient: env.WHATSAPP_TEST_RECIPIENT || "",
        });
      }
      if (url.pathname === "/api/whatsapp/events" && request.method === "GET")
        return json({
          events: await recentEvents(env.DB, env.WHATSAPP_PHONE_NUMBER_ID),
        });
      if (url.pathname === "/api/whatsapp/send" && request.method === "POST") {
        if (
          !env.META_ACCESS_TOKEN ||
          !/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID || "")
        )
          return json(
            {
              error: "Configure o token e o ID do número de teste no servidor.",
            },
            503,
          );
        const raw = await request.text();
        if (raw.length > 12000)
          return json({ error: "Mensagem muito grande." }, 413);
        let message;
        try {
          message = makeMessage(JSON.parse(raw), env.WHATSAPP_TEST_RECIPIENT);
        } catch {
          return json(
            {
              error:
                "Confira o texto e a configuração do destinatário de teste.",
            },
            400,
          );
        }
        const response = await fetch(
          `https://graph.facebook.com/v27.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(message),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          const code = result.error?.code;
          const hints = {
            190: "O token da Meta expirou ou é inválido. Gere um novo e atualize o servidor.",
            131030:
              "Adicione e confirme o destinatário na lista de testes da Meta.",
            131047:
              "A janela de atendimento está fechada. Use o modelo Hello World.",
            10: "A Meta não autorizou esta operação. Confira as permissões do aplicativo.",
            100: "Confira o ID do número e o destinatário configurados.",
          };
          return json(
            {
              error:
                hints[code] ||
                "A Meta recusou o envio. Confira o painel do aplicativo.",
              code,
            },
            502,
          );
        }
        if (!result.messages?.[0]?.id)
          return json({ error: "A Meta não confirmou o envio." }, 502);
        return json({ id: result.messages[0].id, status: "accepted" });
      }
      return json({ error: "Rota não encontrada." }, 404);
    } catch {
      return json(
        { error: "Não foi possível concluir a operação. Tente novamente." },
        500,
      );
    }
  },
};
