import { timingSafeEqual } from "node:crypto";
import {
  MAX_PAYLOAD_BYTES,
  WEBHOOK_PATH,
  validPayload,
} from "../webhook-protocol.mjs";
import { d1WebhookStore } from "./d1-store.mjs";

const encoder = new TextEncoder();
/** @param {number} status @param {string} body @param {Record<string,string>} extra */
const reply = (status, body, extra = {}) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
/** @param {string} a @param {string} b */
const equal = (a, b) => {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
};

/** @param {Request} request */
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAYLOAD_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** @type {ExportedHandler<Env>} */
const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ready = Boolean(
      env.WHATSAPP_VERIFY_TOKEN && env.META_APP_SECRET && env.DB,
    );
    if (request.method === "GET" && url.pathname === "/health") {
      if (!ready) return reply(503, "configuration_required");
      try {
        await env.DB.prepare("SELECT id FROM deliveries LIMIT 1").first();
        return reply(200, "ready");
      } catch {
        return reply(503, "storage_unavailable");
      }
    }
    if (url.pathname !== WEBHOOK_PATH) return reply(404, "Not found");
    if (request.method === "GET") {
      if (!ready) return reply(503, "Webhook not configured");
      const query = url.searchParams;
      const challenge = query.get("hub.challenge");
      if (
        query.get("hub.mode") !== "subscribe" ||
        !equal(
          query.get("hub.verify_token") ?? "",
          env.WHATSAPP_VERIFY_TOKEN,
        ) ||
        !challenge
      )
        return reply(403, "Verification failed");
      return reply(200, challenge);
    }
    if (request.method !== "POST")
      return reply(405, "Method not allowed", { Allow: "GET, POST" });
    if (!ready) return reply(503, "Webhook not configured");
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        request.headers.get("Content-Type") ?? "",
      )
    ) {
      return reply(415, "Expected application/json");
    }
    const signature = request.headers.get("X-Hub-Signature-256") ?? "";
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature))
      return reply(403, "Invalid signature");
    if (Number(request.headers.get("Content-Length")) > MAX_PAYLOAD_BYTES)
      return reply(413, "Payload too large");
    try {
      const raw = await readBody(request);
      if (!raw) return reply(413, "Payload too large");
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.META_APP_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const supplied = Uint8Array.from(
        signature.slice(7).match(/../g) ?? [],
        (hex) => parseInt(hex, 16),
      );
      if (!(await crypto.subtle.verify("HMAC", key, supplied, raw)))
        return reply(403, "Invalid signature");
      let payload;
      try {
        payload = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(raw),
        );
      } catch {
        return reply(400, "Invalid JSON");
      }
      if (!validPayload(payload)) return reply(400, "Invalid WhatsApp payload");
      await d1WebhookStore(env.DB).capture(raw, payload);
      return reply(200, "EVENT_RECEIVED");
    } catch {
      // No bodies, credentials, signatures or query strings in application logs.
      console.error(JSON.stringify({ event: "whatsapp_capture_failed" }));
      return reply(500, "Capture failed; retry later");
    }
  },
};
export default worker;
