import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createWebhookServer, MAX_PAYLOAD_BYTES } from "../server/webhook.mjs";
import { openWebhookStore } from "../server/webhook-store.mjs";

const secret = "test-app-secret";
const token = "test-verification-token";
const makePayload = (
  messages = [
    {
      id: "wamid.1",
      from_user_id: "BSUID.1",
      type: "text",
      text: { body: "Olá" },
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
const signed = (raw) => ({
  "Content-Type": "application/json",
  "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`,
});

async function setup(t, overrides = {}) {
  const store = openWebhookStore(":memory:");
  const server = createWebhookServer({
    verifyToken: token,
    appSecret: secret,
    store,
    logger: { error() {} },
    ...overrides,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/webhooks/whatsapp`;
  const post = (raw, headers = signed(raw)) =>
    fetch(url, { method: "POST", headers, body: raw });
  return { url, post };
}

test("Meta verification returns the exact plain-text challenge only for a matching token and subscribe mode", async (t) => {
  const { url } = await setup(t);
  const query = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": token,
    "hub.challenge": "0012345",
  });
  const response = await fetch(`${url}?${query}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "0012345");
  assert.match(response.headers.get("content-type"), /^text\/plain/);
  for (const [key, value] of [
    ["hub.verify_token", "wrong"],
    ["hub.mode", "unsubscribe"],
    ["hub.challenge", ""],
  ]) {
    const invalid = new URLSearchParams(query);
    invalid.set(key, value);
    assert.equal((await fetch(`${url}?${invalid}`)).status, 403);
  }
});

test("checks signature on exact bytes before capturing a payload", async (t) => {
  const captured = [];
  const { post } = await setup(t, {
    store: {
      capture(raw, payload) {
        captured.push([raw, payload]);
      },
    },
  });
  const raw = JSON.stringify(makePayload(), null, 2);
  assert.equal((await post(raw)).status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0][0].toString(), raw);
  assert.equal((await post(`${raw} `, signed(raw))).status, 403);
  assert.equal(
    (await post(raw, { "Content-Type": "application/json" })).status,
    403,
  );
  assert.equal(
    (await post(raw, { ...signed(raw), "X-Hub-Signature-256": "sha256=x" }))
      .status,
    403,
  );
  assert.equal(captured.length, 1);
});

test("rejects malformed or oversized payloads and unsupported methods", async (t) => {
  const { url, post } = await setup(t);
  for (const raw of [
    "{",
    "null",
    "{}",
    JSON.stringify({ object: "page", entry: [] }),
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "1",
          changes: [{ field: "messages", value: { messages: [null] } }],
        },
      ],
    }),
  ]) {
    assert.equal((await post(raw)).status, 400);
  }
  const raw = JSON.stringify(makePayload());
  assert.equal(
    (await post(raw, { ...signed(raw), "Content-Type": "text/plain" })).status,
    415,
  );
  assert.equal((await post(" ".repeat(MAX_PAYLOAD_BYTES + 1))).status, 413);
  const response = await fetch(url, { method: "PUT" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, POST");
  assert.equal((await fetch(`${url}/unknown`)).status, 404);
});

test("fails closed when credentials are absent and allows Meta to retry storage failures", async (t) => {
  const { url, post } = await setup(t, { appSecret: "" });
  assert.equal((await post(JSON.stringify(makePayload()))).status, 503);
  assert.equal((await fetch(new URL("/health", url))).status, 503);
  const missingToken = await setup(t, { verifyToken: "" });
  assert.equal(
    (
      await fetch(
        `${missingToken.url}?hub.mode=subscribe&hub.verify_token=&hub.challenge=1`,
      )
    ).status,
    503,
  );
  const broken = await setup(t, {
    store: {
      capture() {
        throw new Error("disk full");
      },
    },
  });
  assert.equal((await broken.post(JSON.stringify(makePayload()))).status, 500);
});

test("does not acknowledge a delivery until storage completes", async (t) => {
  let persisted = false;
  const { post } = await setup(t, {
    store: {
      async capture() {
        await new Promise((resolve) => setTimeout(resolve, 25));
        persisted = true;
      },
    },
  });
  const response = await post(JSON.stringify(makePayload()));
  assert.equal(response.status, 200);
  assert.equal(persisted, true);
});

test("persists batches and deduplicates messages across retries and regrouped deliveries after restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "klivo-webhook-"));
  const filename = join(dir, "inbox.sqlite");
  let store;
  let db;
  try {
    store = openWebhookStore(filename);
    const payload = makePayload();
    payload.entry[0].changes[0].value.statuses = [
      { id: "outbound-1", status: "delivered", timestamp: "100" },
      { id: "outbound-1", status: "read", timestamp: "101" },
    ];
    payload.entry.push({
      id: "account-2",
      changes: [{ field: "account_update", value: { event: "VERIFIED" } }],
    });
    const raw = Buffer.from(JSON.stringify(payload));
    store.capture(raw, payload);
    store.capture(raw, payload);
    store.close();
    store = openWebhookStore(filename);
    // The same message arriving in a different batch must not be processed twice.
    const regrouped = makePayload();
    store.capture(Buffer.from(JSON.stringify(regrouped, null, 2)), regrouped);
    db = new DatabaseSync(filename);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM deliveries").get().n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events").get().n, 4);
    const message = db
      .prepare("SELECT payload FROM events WHERE kind = 'message'")
      .get();
    assert.equal(JSON.parse(message.payload).from_user_id, "BSUID.1");
    assert.equal(JSON.parse(message.payload).text.body, "Olá");
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'status'").get()
        .n,
      2,
    );
  } finally {
    db?.close();
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
