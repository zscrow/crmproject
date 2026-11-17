import { webhookEvents } from "../webhook-protocol.mjs";

// The same fixed layout is used by live capture and SQLite imports. 32 KiB
// also fits inline hex literals within D1's SQL statement limit for imports.
const PART_BYTES = 32 * 1024;
const encoder = new TextEncoder();
/** @param {Uint8Array<ArrayBuffer>} bytes */
const hash = async (bytes) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

/** @param {D1Database} db */
export function d1WebhookStore(db) {
  return {
    /** @param {Uint8Array<ArrayBuffer>} raw @param {import('../webhook-protocol.mjs').WebhookPayload} payload */
    async capture(raw, payload, receivedAt = new Date().toISOString()) {
      const bytes = new Uint8Array(raw);
      const id = await hash(bytes);
      const parts = Math.ceil(bytes.byteLength / PART_BYTES);
      const statements = [
        db
          .prepare(
            "INSERT OR IGNORE INTO deliveries (id, received_at, payload_bytes, part_count) VALUES (?, ?, ?, ?)",
          )
          .bind(id, receivedAt, bytes.byteLength, parts),
      ];
      // D1 rows are smaller than Meta's maximum payload. Keep the exact signed
      // bytes in bounded BLOB parts; events point into this immutable receipt.
      for (let part = 0; part < parts; part++) {
        statements.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO delivery_parts (delivery_id, part_index, payload) VALUES (?, ?, ?)",
            )
            .bind(
              id,
              part,
              bytes.slice(part * PART_BYTES, (part + 1) * PART_BYTES).buffer,
            ),
        );
      }
      const insert = db.prepare(
        "INSERT OR IGNORE INTO events (id, delivery_id, account_id, field, kind, payload_path, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const event of webhookEvents(payload)) {
        statements.push(
          insert.bind(
            await hash(encoder.encode(event.identity)),
            id,
            event.accountId,
            event.field,
            event.kind,
            event.payloadPath,
            receivedAt,
          ),
        );
      }
      // D1 batch is transactional: acknowledge only after receipt, all parts,
      // and event identities have committed together. Retry is idempotent.
      const results = await db.batch(statements);
      if (results.some((result) => !result.success))
        throw new Error("D1 capture failed");
    },
  };
}
