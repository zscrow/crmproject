import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import {
  WEBHOOK_PATH,
  MAX_PAYLOAD_BYTES,
  validPayload,
} from "./webhook-protocol.mjs";
export { WEBHOOK_PATH, MAX_PAYLOAD_BYTES };

function equal(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createWebhookServer({
  verifyToken,
  appSecret,
  store,
  logger = console,
}) {
  const server = createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(body);
    };
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return reply(400, "Invalid URL");
    }
    if (url.pathname === "/health" && req.method === "GET") {
      return reply(
        verifyToken && appSecret ? 200 : 503,
        verifyToken && appSecret ? "ready" : "configuration_required",
      );
    }
    if (url.pathname !== WEBHOOK_PATH) return reply(404, "Not found");
    if (req.method === "GET") {
      if (!verifyToken) return reply(503, "Webhook not configured");
      const query = url.searchParams;
      if (
        query.get("hub.mode") !== "subscribe" ||
        !equal(query.get("hub.verify_token") ?? "", verifyToken) ||
        !query.get("hub.challenge")
      )
        return reply(403, "Verification failed");
      return reply(200, query.get("hub.challenge"));
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return reply(405, "Method not allowed");
    }
    if (!appSecret || !verifyToken) return reply(503, "Webhook not configured");
    if (
      !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")
    ) {
      return reply(415, "Expected application/json");
    }
    const signature = req.headers["x-hub-signature-256"];
    if (
      typeof signature !== "string" ||
      !/^sha256=[a-f0-9]{64}$/i.test(signature)
    ) {
      return reply(403, "Invalid signature");
    }
    if (Number(req.headers["content-length"]) > MAX_PAYLOAD_BYTES) {
      return reply(413, "Payload too large");
    }
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_PAYLOAD_BYTES) {
          reply(413, "Payload too large");
          return;
        }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      const expected = createHmac("sha256", appSecret)
        .update(raw)
        .digest("hex");
      if (!equal(signature.slice(7).toLowerCase(), expected))
        return reply(403, "Invalid signature");
      let payload;
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        return reply(400, "Invalid JSON");
      }
      if (!validPayload(payload)) return reply(400, "Invalid WhatsApp payload");
      await store.capture(raw, payload);
      return reply(200, "EVENT_RECEIVED");
    } catch {
      // Never print credentials, message bodies or verification query strings.
      logger.error("WhatsApp webhook: capture failed");
      if (!res.headersSent) reply(500, "Capture failed; retry later");
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return server;
}
