import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import worker from "../server/crm/worker.mjs";
import { workspaceFor } from "../server/crm/workspaces.mjs";
import { sendReply } from "../server/crm/outbound.mjs";
import { d1WebhookStore } from "../server/cloudflare/d1-store.mjs";
import { seedAccount } from "./helpers/account.mjs";

test("D1/API enforce recipient suppression, workspace scope, privileges, stale consent and inbound backlog without Meta calls", async (t) => {
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
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.batch(
      readFileSync("server/cloudflare/migrations/" + file, "utf8")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  const call = (path, body, cookie) =>
    worker.fetch(
      new Request("https://klivo.test/api/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Origin: "https://klivo.test",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { DB: db },
    );
  const account = async (email) => {
    await seedAccount(db, email, "safe-test-password");
    const login = await call("auth/login", {
      email,
      password: "safe-test-password",
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const user = (await login.json()).user;
    const state = await (await call("workspace", null, cookie)).json();
    user.active_workspace_id = state.workspace.id;
    return { user, cookie, state };
  };
  const owner = await account("owner@example.com"),
    outsider = await account("outsider@example.com"),
    agent = await account("agent@example.com");
  let c = await workspaceFor(db, owner.user);
  c.state.contacts = [
    {
      id: 1,
      name: "Pessoa de teste",
      phone: "+5511999999999",
      sector: "Triagem",
      waSenderId: "5511999999999",
      waPhoneNumberId: "phone",
      waAccountId: "account",
      sessionState: "open",
      lastInboundAt: new Date().toISOString(),
    },
  ];
  await db
    .prepare("UPDATE klivo_workspaces SET state_json=? WHERE id=?")
    .bind(JSON.stringify(c.state), c.workspace.id)
    .run();
  await db
    .prepare(
      "INSERT INTO klivo_whatsapp_connections (phone_number_id,account_id,workspace_id,sector,created_at) VALUES ('phone','account',?,'Triagem',?)",
    )
    .bind(c.workspace.id, Date.now())
    .run();
  await db
    .prepare(
      "INSERT INTO klivo_memberships (workspace_id,user_id,role,sectors_json,joined_at) VALUES (?,?,'agent','[\"Triagem\"]',?)",
    )
    .bind(c.workspace.id, agent.user.id, Date.now())
    .run();
  await db
    .prepare("UPDATE klivo_users SET active_workspace_id=? WHERE id=?")
    .bind(c.workspace.id, agent.user.id)
    .run();
  const preference = (scope = "ALL", extra = {}) => ({
    action: "revoke",
    scope,
    source: "email",
    occurredAt: new Date(Date.now() - 1000).toISOString(),
    evidence: "Pedido de interrupção no e-mail do cliente",
    ...extra,
  });
  const mutate = async (person, payload, extra = {}) => {
    const snapshot = await (
      await call("workspace", null, person.cookie)
    ).json();
    return call(
      "workspace/actions",
      {
        action: "recordCommunication",
        args: [1, payload],
        workspaceId: snapshot.workspace.id,
        revision: snapshot.revision,
        operationId: crypto.randomUUID(),
        ...extra,
      },
      person.cookie,
    );
  };
  let response = await mutate(outsider, preference());
  assert.equal(response.status, 400);
  response = await mutate(
    agent,
    preference("UTILITY", { action: "grant", purpose: "Pedido 123" }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /administradores/);
  response = await mutate(owner, preference(), {
    workspaceId: outsider.state.workspace.id,
  });
  assert.equal(response.status, 409);
  c = await workspaceFor(db, owner.user);
  const stale = structuredClone(c);
  response = await mutate(agent, preference());
  assert.equal(
    response.status,
    200,
    "an attendant can honor an external opt-out",
  );
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json({ messages: [{ id: "test-message" }] });
  };
  const env = {
    DB: db,
    META_ACCESS_TOKEN: "test-only",
    WHATSAPP_PHONE_NUMBER_ID: "phone",
  };
  const body = {
    workspaceId: c.workspace.id,
    contactId: 1,
    operationId: crypto.randomUUID(),
    text: "Teste",
  };
  c = await workspaceFor(db, owner.user);
  assert.equal(
    (await sendReply(env, c, owner.user, body, fetcher)).status,
    403,
  );
  assert.equal(
    (await sendReply(env, stale, owner.user, body, fetcher)).status,
    409,
    "a stale screen cannot bypass an opt-out",
  );
  assert.equal(calls, 0);
  response = await mutate(
    owner,
    preference("UTILITY", {
      action: "grant",
      purpose: "Atualizações do pedido 123",
      resume: true,
      occurredAt: new Date(Date.now() - 1).toISOString(),
    }),
  );
  assert.equal(response.status, 200);
  c = await workspaceFor(db, owner.user);
  assert.equal(
    (
      await sendReply(
        env,
        c,
        owner.user,
        { ...body, operationId: crypto.randomUUID() },
        fetcher,
      )
    ).status,
    403,
    "renewed utility consent must not reopen service replies",
  );
  const templateRequest = {
    ...body,
    operationId: crypto.randomUUID(),
    type: "template",
    templateId: "utility-test",
    values: {},
    consent: true,
  };
  const templateFetcher = async (url, options) => {
    if (url.includes("/message_templates"))
      return Response.json({
        data: [
          {
            id: "utility-test",
            name: "utility_test",
            language: "pt_BR",
            category: "UTILITY",
            status: "APPROVED",
            components: [{ type: "BODY", text: "Atualização do pedido 123" }],
          },
        ],
      });
    calls++;
    assert.equal(JSON.parse(options.body).type, "template");
    return Response.json({ messages: [{ id: "utility-message" }] });
  };
  assert.equal(
    (await sendReply(env, c, owner.user, templateRequest, templateFetcher))
      .status,
    200,
    "renewed utility consent must authorize only its approved template category",
  );
  response = await mutate(
    owner,
    preference("SERVICE", {
      action: "grant",
      purpose: "Responder à nova solicitação do cliente",
      resume: true,
      occurredAt: new Date(Date.now() - 1).toISOString(),
    }),
  );
  assert.equal(response.status, 200);
  c = await workspaceFor(db, owner.user);
  assert.equal(
    (
      await sendReply(
        env,
        c,
        owner.user,
        { ...body, operationId: crypto.randomUUID() },
        fetcher,
      )
    ).status,
    200,
  );
  assert.equal(calls, 2);
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "account",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone" },
              messages: [
                {
                  id: "opt-out",
                  from: "5511999999999",
                  type: "text",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: "SAIR" },
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
  assert.equal(
    (
      await sendReply(
        env,
        c,
        owner.user,
        { ...body, operationId: crypto.randomUUID() },
        fetcher,
      )
    ).status,
    409,
    "unprocessed inbound must block sending until synchronized",
  );
  c = await workspaceFor(db, owner.user);
  assert.equal(
    (
      await sendReply(
        env,
        c,
        owner.user,
        { ...body, operationId: crypto.randomUUID() },
        fetcher,
      )
    ).status,
    403,
  );
  assert.equal(calls, 2);
  const otherState = await (
    await call("workspace", null, outsider.cookie)
  ).json();
  assert.equal((otherState.state.communicationHistory || []).length, 0);
  assert.equal(c.state.communicationHistory.length, 4);
});
