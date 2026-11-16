import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const digest = (value) => createHash("sha256").update(value).digest("hex");

export function openWebhookStore(filename) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY, received_at TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL,
      account_id TEXT NOT NULL, field TEXT NOT NULL, kind TEXT NOT NULL,
      payload TEXT NOT NULL, received_at TEXT NOT NULL
    );
  `);
  const delivery = db.prepare(
    "INSERT OR IGNORE INTO deliveries VALUES (?, ?, ?)",
  );
  const event = db.prepare(
    "INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  return {
    capture(raw, payload) {
      const id = digest(raw);
      const now = new Date().toISOString();
      // Keep the receipt and all its events together before acknowledging Meta.
      db.exec("BEGIN IMMEDIATE");
      try {
        delivery.run(id, now, raw.toString("utf8"));
        for (const entry of payload.entry) {
          for (const change of entry.changes) {
            const value = change.value;
            const scope = [entry.id, value.metadata?.phone_number_id ?? ""];
            const save = (kind, item, identity) => {
              const key = digest(
                JSON.stringify([...scope, change.field, kind, identity]),
              );
              event.run(
                key,
                id,
                entry.id,
                change.field,
                kind,
                JSON.stringify(item),
                now,
              );
            };
            for (const message of value.messages ?? []) {
              save("message", message, message.id ?? message);
            }
            for (const status of value.statuses ?? []) {
              save("status", status, [
                status.id,
                status.status,
                status.timestamp,
              ]);
            }
            // Preserve other fields, errors and metadata too, without assuming a phone number.
            if (!value.messages?.length && !value.statuses?.length) {
              save("change", value, value);
            }
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
