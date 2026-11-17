import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { seedAccount } from "./helpers/account.mjs";
import { workspaceFor } from "../server/crm/workspaces.mjs";
import {
  sendReply,
  syncOutbound,
  replyRecipient,
} from "../server/crm/outbound.mjs";
import { d1WebhookStore } from "../server/cloudflare/d1-store.mjs";

test("real D1 outbound replies enforce scope and window, deduplicate and project actual delivery failures", async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('ok')}}",
      compatibilityDate: "2026-11-16",
      cf: false,
      d1Databases: ["DB"],
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync("server/cloudflare/migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.batch(
      readFileSync("server/cloudflare/migrations/" + file, "utf8")
        .replace(/^\uFEFF/, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  await seedAccount(db, "reply@example.com", "test-password");
  const user = await db.prepare("SELECT * FROM klivo_users").first();
  let c = await workspaceFor(db, user);
  user.active_workspace_id = c.workspace.id;
  const contact = {
    id: 1,
    name: "Cliente",
    phone: "+5511999999999",
    sector: c.state.sectors[0],
    sessionState: "open",
    sessionId: "session",
    lastInboundAt: new Date(Date.now() - 60000).toISOString(),
    waitingSince: new Date(Date.now() - 60000).toISOString(),
    waSenderId: "5511999999999",
    waPhoneNumberId: "phone",
    waAccountId: "account",
  };
  c.state.contacts = [contact];
  c.state.messages = {
    1: [
      {
        id: "in-1",
        direction: "inbound",
        source: "whatsapp",
        text: "Oi",
        senderName: "Cliente",
        createdAt: contact.lastInboundAt,
      },
    ],
  };
  await db
    .prepare("UPDATE klivo_workspaces SET state_json=? WHERE id=?")
    .bind(JSON.stringify(c.state), c.workspace.id)
    .run();
  await db
    .prepare(
      "INSERT INTO klivo_whatsapp_connections (phone_number_id,account_id,workspace_id,sector,created_at) VALUES (?,?,?,?,?)",
    )
    .bind("phone", "account", c.workspace.id, contact.sector, Date.now())
    .run();
  c = await workspaceFor(db, user);
  const env = {
    DB: db,
    META_ACCESS_TOKEN: "private-token",
    WHATSAPP_PHONE_NUMBER_ID: "phone",
  };
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    const sent = JSON.parse(options.body);
    assert.equal(sent.to, "5511999999999");
    assert.equal(sent.text.body, "Teste:\nResposta");
    assert.equal(sent.context.message_id, "in-1");
    return Response.json({ messages: [{ id: "wa-out-1" }] });
  };
  const body = {
    workspaceId: c.workspace.id,
    contactId: 1,
    text: "Resposta",
    replyId: "in-1",
    operationId: crypto.randomUUID(),
    to: "attacker",
  };
  assert.equal(
    (
      await sendReply(
        env,
        c,
        user,
        { ...body, workspaceId: "foreign" },
        fetcher,
      )
    ).status,
    409,
  );
  assert.equal(
    (await sendReply(env, c, user, { ...body, contactId: 2 }, fetcher)).status,
    403,
  );
  const restricted = structuredClone(c);
  restricted.state.team[0].role = "Atendente";
  restricted.state.team[0].allowedSectors = [];
  assert.equal(
    (await sendReply(env, restricted, user, body, fetcher)).status,
    403,
  );
  const expired = structuredClone(c);
  expired.state.contacts[0].lastInboundAt = new Date(
    Date.now() - 86400000,
  ).toISOString();
  assert.equal(
    (await sendReply(env, expired, user, body, fetcher)).status,
    400,
  );
  const foreignPhone = structuredClone(c);
  foreignPhone.state.contacts[0].waPhoneNumberId = "other";
  assert.equal(
    (await sendReply(env, foreignPhone, user, body, fetcher)).status,
    403,
  );
  const assigned = structuredClone(c);
  assigned.state.contacts[0].assigneeId = "other-user";
  assert.equal(
    (await sendReply(env, assigned, user, body, fetcher)).status,
    403,
  );
  assert.equal(calls, 0);
  assert.equal((await sendReply(env, c, user, body, fetcher)).status, 200);
  assert.equal((await sendReply(env, c, user, body, fetcher)).status, 200);
  assert.equal(
    (await sendReply(env, c, user, { ...body, text: "Alterado" }, fetcher))
      .status,
    409,
  );
  assert.equal(calls, 1);
  c = await workspaceFor(db, user);
  assert.equal(c.state.messages[1].at(-1).delivery, "accepted");
  assert.equal(c.state.contacts[0].waitingSince, contact.waitingSince);
  async function capture(status, phone = "phone", id = "wa-out-1") {
    const payload = {
      entry: [
        {
          id: "account",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: phone },
                statuses: [
                  {
                    id,
                    status,
                    recipient_id: "5511999999999",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    ...(status === "failed"
                      ? { errors: [{ code: 130497 }] }
                      : {}),
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await d1WebhookStore(db).capture(
      new TextEncoder().encode(JSON.stringify(payload)),
      payload,
    );
    await syncOutbound(db, c.workspace.id);
  }
  await capture("delivered", "foreign");
  c = await workspaceFor(db, user);
  assert.equal(c.state.messages[1].at(-1).delivery, "accepted");
  await capture("failed");
  c = await workspaceFor(db, user);
  assert.equal(c.state.messages[1].at(-1).delivery, "failed");
  assert.match(c.state.messages[1].at(-1).deliveryError, /130497/);
  assert.equal(c.state.contacts[0].waitingSince, contact.waitingSince);
  await capture("sent");
  c = await workspaceFor(db, user);
  assert.equal(c.state.messages[1].at(-1).delivery, "failed");
  await capture("delivered");
  c = await workspaceFor(db, user);
  assert.equal(c.state.messages[1].at(-1).delivery, "delivered");
  assert.equal(c.state.contacts[0].waitingSince, null);
  assert.equal(
    c.state.messages[1].filter((x) => x.direction === "outbound").length,
    1,
  );

  const unknown = { ...body, replyId: null, operationId: crypto.randomUUID() };
  let uncertainCalls = 0;
  const uncertain = async () => {
    uncertainCalls++;
    throw Error("connection lost");
  };
  assert.equal((await sendReply(env, c, user, unknown, uncertain)).status, 409);
  assert.equal((await sendReply(env, c, user, unknown, uncertain)).status, 409);
  assert.equal(uncertainCalls, 1);
  const rejected = { ...body, replyId: null, operationId: crypto.randomUUID() };
  assert.equal(
    (
      await sendReply(env, c, user, rejected, async () =>
        Response.json({ error: { code: 190 } }, { status: 401 }),
      )
    ).status,
    502,
  );
  c = await workspaceFor(db, user);
  assert.ok(c.state.messages[1].some((x) => x.delivery === "unknown"));
  assert.ok(
    c.state.messages[1].some(
      (x) => x.delivery === "failed" && x.deliveryError.includes("190"),
    ),
  );
  c.state.contacts[0].sessionState = "closed";
  c.state.contacts[0].lastInboundAt = new Date(
    Date.now() - 90000000,
  ).toISOString();
  await db
    .prepare("UPDATE klivo_workspaces SET state_json=? WHERE id=?")
    .bind(JSON.stringify(c.state), c.workspace.id)
    .run();
  c = await workspaceFor(db, user);
  const oldInbound = c.state.contacts[0].lastInboundAt;
  const approved = {
    id: "hello-id",
    name: "hello_world",
    status: "APPROVED",
    language: "en_US",
    category: "UTILITY",
    components: [{ type: "BODY", text: "Hello approved" }],
  };
  let posts = 0;
  const templateFetcher = async (url, options) => {
    if (url.includes("/message_templates"))
      return Response.json({ data: [approved] });
    posts++;
    const sent = JSON.parse(options.body);
    assert.equal(sent.type, "template");
    assert.equal(sent.template.name, "hello_world");
    assert.equal(sent.template.language.code, "en_US");
    assert.equal(sent.text, undefined);
    return Response.json({ messages: [{ id: "template-message" }] });
  };
  const templateBody = {
    workspaceId: c.workspace.id,
    contactId: 1,
    operationId: crypto.randomUUID(),
    type: "template",
    templateId: "hello-id",
    values: {},
    consent: false,
  };
  assert.equal(
    (await sendReply(env, c, user, templateBody, templateFetcher)).status,
    400,
  );
  templateBody.consent = true;
  assert.equal(
    (
      await sendReply(
        env,
        c,
        user,
        { ...templateBody, templateId: "foreign-id" },
        templateFetcher,
      )
    ).status,
    400,
  );
  assert.equal(posts, 0);
  assert.equal(
    (await sendReply(env, c, user, templateBody, templateFetcher)).status,
    200,
  );
  assert.equal(
    (await sendReply(env, c, user, templateBody, templateFetcher)).status,
    200,
  );
  assert.equal(posts, 1);
  await capture("delivered", "phone", "template-message");
  c = await workspaceFor(db, user);
  assert.equal(c.state.contacts[0].sessionState, "closed");
  assert.equal(c.state.contacts[0].lastInboundAt, oldInbound);
  assert.equal(c.state.messages[1].at(-1).type, "template");
  assert.equal(c.state.messages[1].at(-1).text, "Hello approved");
});

test("Brazilian inbound aliases only map to the same configured test recipient", () => {
  assert.equal(
    replyRecipient("553799982790", "5537999982790"),
    "5537999982790",
  );
  assert.equal(replyRecipient("553799982790", "5537999561020"), "553799982790");
  assert.equal(
    replyRecipient("5511999999999", "5511999999999"),
    "5511999999999",
  );
  assert.equal(replyRecipient("14155552671", "5511999999999"), "14155552671");
});
