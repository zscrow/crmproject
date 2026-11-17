import { test } from "node:test";
import assert from "node:assert/strict";
import worker, {
  authorized,
  makeMessage,
  recentEvents,
} from "../server/crm/worker.mjs";
const key = "a".repeat(64);
test("CRM API denies anonymous access and missing or short server keys", async () => {
  assert.equal(
    authorized(new Request("https://crm.test/api/whatsapp/events"), key),
    false,
  );
  assert.equal(
    authorized(
      new Request("https://crm.test/", {
        headers: { Authorization: "Bearer " + key },
      }),
      "short",
    ),
    false,
  );
  const response = await worker.fetch(
    new Request("https://crm.test/api/whatsapp/events"),
    {
      DB: {
        prepare() {
          return {
            bind() {
              return this;
            },
            async first() {
              return { role: "owner" };
            },
          };
        },
      },
    },
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("CRM sends only to the configured recipient, validates input and isolates templates", () => {
  const message = makeMessage(
    { type: "text", text: " olá ", to: "attacker" },
    "5537999999999",
  );
  assert.equal(message.to, "5537999999999");
  assert.equal(message.text.body, "olá");
  assert.throws(() =>
    makeMessage({ type: "text", text: "a".repeat(4097) }, "5537999999999"),
  );
  assert.throws(() => makeMessage({ type: "text", text: "ok" }, ""));
  assert.equal(
    makeMessage({ type: "template", name: "arbitrary" }, "5537999999999")
      .template.name,
    "hello_world",
  );
});
test("CRM rejects foreign origins before attempting sends", async () => {
  const response = await worker.fetch(
    new Request("https://crm.test/api/whatsapp/send", {
      method: "POST",
      headers: {
        Cookie: "__Host-klivo_session=" + key,
        Origin: "https://other.test",
      },
    }),
    {
      DB: {
        prepare() {
          return {
            bind() {
              return this;
            },
            async first() {
              return { role: "owner" };
            },
          };
        },
      },
    },
  );
  assert.equal(response.status, 403);
});
test("CRM reassembles split webhook payloads, deduplicates events and filters phone ID", async () => {
  const value = {
    metadata: { phone_number_id: "123" },
    messages: [
      {
        id: "m1",
        from: "5511999999999",
        text: { body: "Olá 🌎" },
        type: "text",
      },
    ],
    statuses: [
      {
        id: "status-1",
        status: "failed",
        timestamp: "1794910000",
        errors: [{ code: 130497 }, { code: "invalid" }],
      },
    ],
  };
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ id: "account", changes: [{ field: "messages", value }] }],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const db = {
    prepare(sql) {
      return {
        bind() {
          return this;
        },
        async all() {
          return {
            results: sql.includes("SELECT id,")
              ? [
                  { id: "d1", received_at: "2026-11-17T10:00:00Z" },
                  { id: "d2", received_at: "2026-11-17T09:00:00Z" },
                ]
              : [
                  { payload: Array.from(bytes.slice(0, 100)) },
                  { payload: Array.from(bytes.slice(100)) },
                ],
          };
        },
      };
    },
  };
  const events = await recentEvents(db, "123");
  assert.equal(events.length, 2);
  assert.equal(events[0].text, "Olá 🌎");
  assert.deepEqual(events[1].errorCodes, [130497]);
  assert.deepEqual(await recentEvents(db, "456"), []);
});
