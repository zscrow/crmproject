import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
test("workspace isolation, permissions, invitations and concurrent updates with real D1", async (t) => {
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "deploy",
      "--config",
      "wrangler.app.jsonc",
      "--dry-run",
      "--outdir",
      ".runtime/workspace-test-build",
    ],
    { stdio: "pipe" },
  );
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: readFileSync(".runtime/workspace-test-build/worker.js", "utf8"),
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
  async function register(email) {
    const r = await call("/api/auth/register", null, {
      name: email.split("@")[0],
      email,
      company: "Empresa " + email,
      password: "secure-test-password",
    });
    assert.equal(r.status, 200);
    return {
      cookie: r.headers.get("set-cookie").split(";")[0],
      user: (await r.json()).user,
    };
  }
  const owner = await register("owner@example.com"),
    other = await register("other@example.com"),
    agent = await register("agent@example.com");
  const get = async (account) => {
    const r = await call("/api/workspace", account.cookie);
    assert.equal(r.status, 200);
    return r.json();
  };
  let a = await get(owner),
    b = await get(other);
  assert.notEqual(a.workspace.id, b.workspace.id);
  assert.equal(a.state.contacts.length, 0);
  assert.equal(a.state.team.length, 1);
  assert.equal(a.state.activeAgentId, owner.user.id);
  const mutate = (account, context, action, args, extra = {}) =>
    call("/api/workspace/actions", account.cookie, {
      workspaceId: context.workspace.id,
      revision: context.revision,
      operationId: crypto.randomUUID(),
      action,
      args,
      ...extra,
    });
  let r = await mutate(owner, a, "saveContact", [
    {
      name: "Private Client",
      phone: "5511998887777",
      sector: "Triagem",
      company: "",
      email: "",
      tag: "Cliente",
      assigneeId: "forged",
    },
  ]);
  assert.equal(r.status, 200);
  a = await r.json();
  const contactId = a.result.contact.id;
  assert.equal(a.state.contacts[0].assigneeId, owner.user.id);
  assert.equal((await get(other)).state.contacts.length, 0);
  r = await mutate(other, a, "saveNote", [contactId, "attack"]);
  assert.equal(r.status, 409);
  r = await mutate(other, b, "saveNote", [contactId, "attack"]);
  assert.equal(r.status, 400);
  const operationId = crypto.randomUUID();
  r = await mutate(owner, a, "saveNote", [contactId, "saved"], { operationId });
  assert.equal(r.status, 200);
  let saved = await r.json();
  r = await mutate(owner, a, "saveNote", [contactId, "saved"], { operationId });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).revision, saved.revision);
  r = await mutate(owner, a, "saveNote", [contactId, "stale"]);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).state.contacts[0].note, "saved");
  a = saved;
  const changes = await Promise.all([
    mutate(owner, a, "favorite", [contactId]),
    mutate(owner, a, "favorite", [contactId]),
  ]);
  assert.deepEqual(changes.map((x) => x.status).sort(), [200, 409]);
  a = await get(owner);
  const invite = await call("/api/workspace/invitations", owner.cookie, {
    workspaceId: a.workspace.id,
    email: agent.user.email,
    role: "agent",
    sectors: ["Arte"],
  });
  assert.equal(invite.status, 200);
  const token = new URL((await invite.json()).url).searchParams.get("invite");
  r = await call("/api/workspace/join", other.cookie, { token });
  assert.equal(r.status, 403);
  r = await call("/api/workspace/join", agent.cookie, { token });
  assert.equal(r.status, 200);
  let staff = await get(agent);
  assert.equal(staff.workspace.id, a.workspace.id);
  assert.equal(staff.state.contacts.length, 0);
  assert.equal(staff.state.activeAgentId, agent.user.id);
  r = await mutate(agent, staff, "setAgent", [owner.user.id]);
  assert.equal(r.status, 403);
  r = await mutate(agent, staff, "saveNote", [contactId, "hidden sector"]);
  assert.equal(r.status, 400);
  r = await call("/api/workspace/invitations", agent.cookie, {
    workspaceId: a.workspace.id,
    email: "x@example.com",
    role: "admin",
    sectors: ["Arte"],
  });
  assert.equal(r.status, 403);
  r = await call("/api/workspace/member", owner.cookie, {
    workspaceId: a.workspace.id,
    userId: agent.user.id,
    role: "agent",
    sectors: ["Arte", "Triagem"],
    capabilities: { viewLogs: true },
  });
  assert.equal(r.status, 200);
  staff = await get(agent);
  assert.equal(staff.state.contacts.length, 1);
  r = await mutate(agent, staff, "saveNote", [contactId, "Staff note"]);
  assert.equal(r.status, 200);
  assert.equal((await get(owner)).state.contacts[0].note, "Staff note");
  a = await get(owner);
  r = await call("/api/workspace/member", owner.cookie, {
    workspaceId: a.workspace.id,
    userId: owner.user.id,
    role: "agent",
    sectors: ["Arte"],
  });
  assert.equal(r.status, 409);
  r = await call("/api/workspace/join", agent.cookie, { token });
  assert.equal(r.status, 403);
  r = await call("/api/workspace/switch", other.cookie, {
    workspaceId: a.workspace.id,
  });
  assert.equal(r.status, 403);
  // A previously signed-in agent is checked against current sector permissions.
  await call("/api/workspace/member", owner.cookie, {
    workspaceId: a.workspace.id,
    userId: agent.user.id,
    role: "agent",
    sectors: ["Arte"],
    capabilities: {},
  });
  staff = await get(agent);
  assert.equal(staff.state.contacts.length, 0);
  r = await mutate(agent, staff, "saveNote", [contactId, "revoked"]);
  assert.equal(r.status, 400);
  const empty = await get(other);
  r = await call("/api/workspace/import", other.cookie, {
    workspaceId: empty.workspace.id,
    revision: empty.revision,
    operationId: crypto.randomUUID(),
    snapshot: {
      contacts: [
        { id: 1, name: "Legacy", phone: "5511988887777", sector: "Legacy" },
      ],
      messages: {
        1: [
          {
            text: "Old text",
            direction: "inbound",
            createdAt: "2026-11-17T10:00:00Z",
            attachments: [{ mediaId: "local" }],
          },
        ],
      },
    },
  });
  assert.equal(r.status, 200);
  const imported = await r.json();
  assert.equal(imported.state.contacts[0].assigneeId, other.user.id);
  assert.equal(imported.state.messages[1][0].source, "imported");
  assert.equal(imported.state.messages[1][0].attachments, undefined);
  assert.equal((await get(owner)).state.contacts.length, 1);
  r = await call("/api/workspace/remove-member", owner.cookie, {
    workspaceId: a.workspace.id,
    userId: agent.user.id,
  });
  assert.equal(r.status, 200);
  assert.notEqual((await get(agent)).workspace.id, a.workspace.id);
  r = await call("/api/workspace/switch", agent.cookie, {
    workspaceId: a.workspace.id,
  });
  assert.equal(r.status, 403);
  r = await call("/api/workspace/remove-member", owner.cookie, {
    workspaceId: a.workspace.id,
    userId: owner.user.id,
  });
  assert.equal(r.status, 409);
  const oldWorkspace = (await get(owner)).workspace.id;
  const newInvite = await call("/api/workspace/invitations", owner.cookie, {
    workspaceId: oldWorkspace,
    email: other.user.email,
    role: "admin",
    sectors: ["Triagem"],
  });
  const newToken = new URL((await newInvite.json()).url).searchParams.get(
    "invite",
  );
  assert.equal(
    (await call("/api/workspace/join", other.cookie, { token: newToken }))
      .status,
    200,
  );
  assert.equal(
    (
      await call("/api/workspace/remove-member", owner.cookie, {
        workspaceId: oldWorkspace,
        userId: owner.user.id,
      })
    ).status,
    200,
  );
  assert.notEqual((await get(owner)).workspace.id, oldWorkspace);
});
