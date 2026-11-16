import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { MAX_PAYLOAD_BYTES } from "../server/webhook-protocol.mjs";

const secret = "cloudflare-test-secret";
const token = "cloudflare-test-verify";
const makePayload = (
  messages = [
    {
      id: "wamid.1",
      from_user_id: "BSUID.1",
      type: "text",
      text: { body: "Olá 🌎" },
    },
  ],
) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "account-1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "phone-1" },
            messages,
          },
        },
      ],
    },
  ],
});
const headers = (raw) => ({
  "Content-Type": "application/json",
  "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`,
});

test("Cloudflare Worker with a real local D1 binding", async (t) => {
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "deploy",
      "--dry-run",
      "--outdir",
      ".runtime/test-worker-build",
    ],
    {
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: resolve(".runtime/wrangler-logs"),
      },
      stdio: "pipe",
    },
  );
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: readFileSync(".runtime/test-worker-build/worker.js", "utf8"),
      compatibilityDate: "2026-11-16",
      compatibilityFlags: ["nodejs_compat"],
      cf: false,
      d1Databases: ["DB"],
      bindings: { WHATSAPP_VERIFY_TOKEN: token, META_APP_SECRET: secret },
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  const migration = readFileSync(
    "server/cloudflare/migrations/0001_webhooks.sql",
    "utf8",
  );
  await db.batch(
    migration
      .split(";")
      .map((sql) => sql.trim())
      .filter(Boolean)
      .map((sql) => db.prepare(sql)),
  );
  const request = (path, options) =>
    mf.dispatchFetch(`https://webhook.test${path}`, options);
  const post = (raw, overrides = {}) =>
    request("/webhooks/whatsapp", {
      method: "POST",
      body: raw,
      headers: headers(raw),
      ...overrides,
    });
  const count = async (table) =>
    (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;

  await t.test(
    "verifies the exact challenge, rejects wrong tokens and checks schema readiness",
    async () => {
      const query = new URLSearchParams({
        "hub.mode": "subscribe",
        "hub.verify_token": token,
        "hub.challenge": "00045",
      });
      const response = await request(`/webhooks/whatsapp?${query}`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "00045");
      query.set("hub.verify_token", "wrong");
      assert.equal((await request(`/webhooks/whatsapp?${query}`)).status, 403);
      assert.equal((await request("/health")).status, 200);
      assert.equal((await request("/unknown")).status, 404);
      assert.equal(
        (await request("/webhooks/whatsapp", { method: "PUT" })).status,
        405,
      );
    },
  );

  await t.test(
    "authenticates the exact signed bytes before interpreting JSON or writing data",
    async () => {
      const raw = JSON.stringify(makePayload(), null, 2);
      assert.equal(
        (await post(raw + " ", { headers: headers(raw) })).status,
        403,
      );
      assert.equal(
        (await post(raw, { headers: { "Content-Type": "application/json" } }))
          .status,
        403,
      );
      assert.equal((await post("{")).status, 400);
      assert.equal((await post("null")).status, 400);
      assert.equal(await count("deliveries"), 0);
      assert.equal((await post(raw)).status, 200);
      assert.equal(await count("deliveries"), 1);
      assert.equal(await count("events"), 1);
    },
  );

  await t.test(
    "deduplicates retries and regrouped messages while preserving different delivery statuses",
    async () => {
      const raw = JSON.stringify(makePayload(), null, 2);
      assert.equal((await post(raw)).status, 200);
      const regrouped = makePayload();
      regrouped.entry[0].changes[0].value.statuses = [
        { id: "outbound-1", status: "delivered", timestamp: "100" },
        { id: "outbound-1", status: "read", timestamp: "101" },
      ];
      regrouped.entry.push({
        id: "account-2",
        changes: [{ field: "account_update", value: { event: "VERIFIED" } }],
      });
      assert.equal((await post(JSON.stringify(regrouped))).status, 200);
      assert.equal(await count("deliveries"), 2);
      assert.equal(await count("events"), 4);
      const event = await db
        .prepare(
          "SELECT delivery_id, payload_path FROM events WHERE kind='message'",
        )
        .first();
      const { results } = await db
        .prepare(
          "SELECT payload FROM delivery_parts WHERE delivery_id=? ORDER BY part_index",
        )
        .bind(event.delivery_id)
        .all();
      const restored = JSON.parse(
        Buffer.concat(results.map((row) => Buffer.from(row.payload))).toString(
          "utf8",
        ),
      );
      assert.equal(
        restored.entry[0].changes[0].value.messages[0].from_user_id,
        "BSUID.1",
      );
      assert.equal(
        restored.entry[0].changes[0].value.messages[0].text.body,
        "Olá 🌎",
      );
      assert.equal(
        event.payload_path,
        "$.entry[0].changes[0].value.messages[0]",
      );
    },
  );

  await t.test("stores all 1000 updates in a batch", async () => {
    const payload = makePayload(
      Array.from({ length: 1000 }, (_, i) => ({
        id: `batch-${i}`,
        type: "text",
        text: { body: "teste" },
      })),
    );
    assert.equal((await post(JSON.stringify(payload))).status, 200);
    assert.equal(await count("events"), 1004);
  });

  await t.test(
    "stores payloads above the D1 row limit in parts and reconstructs exact bytes",
    async () => {
      const raw = JSON.stringify(
        makePayload([
          {
            id: "large-1",
            type: "text",
            text: { body: "á".repeat(1_200_000) },
          },
        ]),
      );
      assert.ok(Buffer.byteLength(raw) > 2_000_000);
      assert.equal((await post(raw)).status, 200);
      const event = await db
        .prepare(
          "SELECT delivery_id FROM events ORDER BY received_at DESC LIMIT 1",
        )
        .first();
      const { results } = await db
        .prepare(
          "SELECT payload FROM delivery_parts WHERE delivery_id=? ORDER BY part_index",
        )
        .bind(event.delivery_id)
        .all();
      assert.ok(results.length > 1);
      assert.equal(
        Buffer.concat(results.map((row) => Buffer.from(row.payload))).toString(
          "utf8",
        ),
        raw,
      );
      // Use the runtime binding for early rejection: the HTTP test adapter can
      // reset its upload socket when a Worker returns before reading a large body.
      const direct = await mf.getWorker();
      const oversized = " ".repeat(MAX_PAYLOAD_BYTES + 1);
      const rejected = await direct.fetch(
        "https://webhook.test/webhooks/whatsapp",
        {
          method: "POST",
          body: oversized,
          headers: headers(oversized),
        },
      );
      assert.equal(rejected.status, 413);
    },
  );

  await t.test(
    "rolls back the whole capture when any D1 statement fails",
    async () => {
      const before = await count("deliveries");
      const partsBefore = await count("delivery_parts");
      await db
        .prepare(
          "CREATE TRIGGER test_failure BEFORE INSERT ON events WHEN NEW.account_id='rollback-account' BEGIN SELECT RAISE(ABORT, 'test failure'); END",
        )
        .run();
      const payload = makePayload([
        { id: "rollback-message", type: "text", text: { body: "rollback" } },
      ]);
      payload.entry[0].id = "rollback-account";
      assert.equal((await post(JSON.stringify(payload))).status, 500);
      assert.equal(await count("deliveries"), before);
      assert.equal(await count("delivery_parts"), partsBefore);
      await db.prepare("DROP TRIGGER test_failure").run();
      assert.equal((await post(JSON.stringify(payload))).status, 200);
    },
  );
});
