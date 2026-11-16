import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { d1WebhookStore } from "../server/cloudflare/d1-store.mjs";
import { validPayload } from "../server/webhook-protocol.mjs";

const source = new DatabaseSync(
  resolve(process.env.WEBHOOK_DB_PATH || ".runtime/whatsapp.sqlite"),
  { readOnly: true },
);
const statements = [];
function literal(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (value instanceof ArrayBuffer)
    return `X'${Buffer.from(value).toString("hex")}'`;
  throw new Error("Unsupported import value");
}
const planner = {
  prepare(sql) {
    return {
      bind(...values) {
        let i = 0;
        return sql.replace(/\?/g, () => literal(values[i++])) + ";";
      },
    };
  },
  async batch(batch) {
    statements.push(...batch);
    return batch.map(() => ({ success: true }));
  },
};
// Smaller parts keep inline hex literals below D1's SQL statement limit.
const store = d1WebhookStore(planner);
let count = 0;
try {
  for (const receipt of source
    .prepare("SELECT received_at, payload FROM deliveries ORDER BY received_at")
    .iterate()) {
    const payload = JSON.parse(receipt.payload);
    if (!validPayload(payload)) throw new Error("Invalid local receipt");
    await store.capture(
      Buffer.from(receipt.payload, "utf8"),
      payload,
      receipt.received_at,
    );
    count++;
  }
} finally {
  source.close();
}
mkdirSync(".runtime", { recursive: true });
writeFileSync(".runtime/whatsapp-import.sql", statements.join("\n"));
console.log(`Prepared ${count} local receipts in .runtime/whatsapp-import.sql`);
