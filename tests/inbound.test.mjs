import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { d1WebhookStore } from "../server/cloudflare/d1-store.mjs";
test("stored WhatsApp messages open the correct workspace inbox exactly once", async (t) => {
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "deploy",
      "--config",
      "wrangler.app.jsonc",
      "--dry-run",
      "--outdir",
      ".runtime/inbound-test-build",
    ],
    { stdio: "pipe" },
  );
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: readFileSync(".runtime/inbound-test-build/worker.js", "utf8"),
      compatibilityDate: "2026-11-16",
      compatibilityFlags: ["nodejs_compat"],
      cf: false,
      d1Databases: ["DB"],
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  for (const name of [
    "0001_webhooks.sql",
    "0002_auth.sql",
    "0003_workspaces.sql",
    "0004_inbound.sql",
    "0005_message_views.sql",
    "0006_usernames.sql",
  ])
    await db.batch(
      readFileSync("server/cloudflare/migrations/" + name, "utf8")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((sql) => db.prepare(sql)),
    );
  const call = (path, cookie, body) =>
    mf.dispatchFetch("https://klivo.test" + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body
          ? { "Content-Type": "application/json", Origin: "https://klivo.test" }
          : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  async function account(email) {
    const r = await call("/api/auth/register", null, {
      email,
      password: "a-secure-test-password",
      name: email.split("@")[0],
      company: "Empresa",
    });
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie").split(";")[0];
    const workspace = await get(cookie);
    return { cookie, workspace };
  }
  async function get(cookie) {
    const r = await call("/api/workspace", cookie);
    assert.equal(r.status, 200);
    return r.json();
  }
  const a = await account("one@example.com"),
    b = await account("two@example.com"),
    c = await account("three@example.com");
  await db.batch([
    db
      .prepare(
        "INSERT INTO klivo_whatsapp_connections (phone_number_id,account_id,workspace_id,sector,created_at) VALUES (?,?,?,?,?)",
      )
      .bind(
        "phone-1",
        "account",
        a.workspace.workspace.id,
        "Triagem",
        Date.now(),
      ),
    db
      .prepare(
        "INSERT INTO klivo_whatsapp_connections (phone_number_id,account_id,workspace_id,sector,created_at) VALUES (?,?,?,?,?)",
      )
      .bind(
        "phone-2",
        "account",
        b.workspace.workspace.id,
        "Triagem",
        Date.now(),
      ),
  ]);
  async function action(context, workspace, name, args) {
    const r = await call("/api/workspace/actions", context.cookie, {
      workspaceId: workspace.workspace.id,
      revision: workspace.revision,
      operationId: crypto.randomUUID(),
      action: name,
      args,
    });
    assert.equal(r.status, 200);
    return r.json();
  }
  a.workspace = await action(a, a.workspace, "saveContact", [
    {
      name: "Nome manual",
      phone: "+5511988887777",
      company: "Cliente",
      email: "",
      tag: "Cliente",
      sector: "Triagem",
    },
  ]);
  const contactId = a.workspace.result.contact.id;
  const stamp = Math.floor(Date.now() / 1000),
    sender = "5511988887777";
  const message = (id, text, time) => ({
    id,
    from: sender,
    type: "text",
    text: { body: text },
    timestamp: String(time),
  });
  const change = (phone, messages) => ({
    field: "messages",
    value: {
      metadata: { phone_number_id: phone },
      contacts: [{ wa_id: sender, profile: { name: "Nome WhatsApp" } }],
      messages,
    },
  });
  async function capture(changes) {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ id: "account", changes }],
    };
    await d1WebhookStore(db).capture(
      new TextEncoder().encode(JSON.stringify(payload)),
      payload,
    );
  }
  await capture([
    change("phone-1", [
      message("m2", "Segunda", stamp - 5),
      message("m1", "Primeira", stamp - 10),
    ]),
    change("phone-2", [message("b1", "Somente B", stamp)]),
    change("unknown", [message("hidden", "Outro número", stamp)]),
    {
      field: "messages",
      value: {
        metadata: { phone_number_id: "phone-1" },
        statuses: [
          {
            id: "out1",
            status: "failed",
            timestamp: String(stamp),
            recipient_id: sender,
          },
        ],
      },
    },
  ]);
  const [first, parallel] = await Promise.all([get(a.cookie), get(a.cookie)]);
  assert.equal(first.state.contacts.length, 1);
  assert.equal(first.state.contacts[0].id, contactId);
  assert.equal(first.state.contacts[0].name, "Nome manual");
  assert.equal(first.state.contacts[0].sessionState, "open");
  assert.equal(first.state.contacts[0].queueState, "Sem resposta");
  assert.deepEqual(
    first.state.messages[contactId].map((m) => m.text),
    ["Primeira", "Segunda"],
  );
  assert.equal(parallel.state.messages[contactId].length, 2);
  assert.equal(first.inbox.connected, true);
  assert.ok(first.inbox.lastMessageAt);
  const onlyB = await get(b.cookie);
  assert.equal(onlyB.state.contacts.length, 1);
  assert.equal(
    onlyB.state.messages[onlyB.state.contacts[0].id][0].text,
    "Somente B",
  );
  assert.equal((await get(c.cookie)).state.contacts.length, 0);
  await capture([change("phone-1", [message("m1", "Primeira", stamp - 10)])]);
  const again = await get(a.cookie);
  assert.equal(again.state.messages[contactId].length, 2);
  assert.equal(again.revision, first.revision);
  let closed = await action(a, again, "close", [contactId]);
  assert.equal(closed.state.contacts[0].sessionState, "closed");
  await capture([change("phone-1", [message("m3", "Retorno", stamp)])]);
  let reopened = await get(a.cookie);
  assert.equal(reopened.state.contacts[0].sessionState, "open");
  assert.equal(reopened.state.contacts[0].preview, "Retorno");
  assert.equal(reopened.state.messages[contactId].filter(m=>m.direction==='inbound').length, 3);
  closed = await action(a, reopened, "close", [contactId]);
  await capture([
    change("phone-1", [message("old", "Mensagem atrasada", stamp - 3600)]),
  ]);
  const late = await get(a.cookie);
  assert.equal(late.state.contacts[0].sessionState, "closed");
  assert.equal(late.state.contacts[0].preview, "Retorno");
  assert.equal(late.state.messages[contactId].filter(m=>m.direction==='inbound').length, 4);
  await capture([
    {
      field: "messages",
      value: {
        metadata: { phone_number_id: "phone-1" },
        contacts: [{ wa_id: "BSUID.abc", profile: { name: "Sem telefone" } }],
        messages: [
          {
            id: "bsuid",
            from_user_id: "BSUID.abc",
            type: "image",
            image: { id: "media-1", caption: "Uma imagem" },
            timestamp: String(stamp),
          },
        ],
      },
    },
  ]);
  const bsuid = await get(a.cookie),
    bsContact = bsuid.state.contacts.find((p) => p.waSenderId === "BSUID.abc");
  assert.ok(bsContact);
  assert.equal(bsContact.phone, "");
  assert.equal(bsuid.state.messages[bsContact.id][0].waType, "image");
  assert.match(bsuid.state.messages[bsContact.id][0].text, /Uma imagem/);
  const blocked = await call("/api/workspace/actions", a.cookie, {
    workspaceId: bsuid.workspace.id,
    revision: bsuid.revision,
    operationId: crypto.randomUUID(),
    action: "send",
    args: [contactId, "Não enviar"],
  });
  assert.equal(blocked.status, 403);
  const receipts = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM klivo_inbox_receipts WHERE workspace_id=? AND ignored_reason IS NULL",
    )
    .bind(a.workspace.workspace.id)
    .first();
  assert.equal(receipts.n, 5);
});
