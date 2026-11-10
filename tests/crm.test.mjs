import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/domain/crm.mjs";
import M from "../src/domain/session.mjs";
const sectors = ["Arte", "Impressão", "Financeiro", "E-commerce", "Triagem"];
test("staff sees precisely the configured sectors while administrators see all", () => {
  const staff = {
    id: "a",
    role: "Atendente",
    sector: "Arte",
    allowedSectors: ["Arte", "Financeiro"],
  };
  assert.deepEqual(C.allowedSectors(staff, sectors), ["Arte", "Financeiro"]);
  assert.equal(C.canViewContact(staff, { sector: "Impressão" }), false);
  assert.equal(C.canViewContact(staff, { sector: "Financeiro" }), true);
  assert.deepEqual(
    C.allowedSectors({ role: "Administrador" }, sectors),
    sectors,
  );
  assert.equal(C.capability(staff, "editTemplates"), false);
  staff.capabilities = { editTemplates: true };
  assert.equal(C.capability(staff, "editTemplates"), true);
});
test("formatted national and international phone numbers identify the same client", () => {
  const contacts = [{ id: 1, phone: "+55 (11) 98765-4320" }];
  assert.equal(C.duplicate(contacts, "11 98765 4320").id, 1);
  assert.equal(C.duplicate(contacts, "005511987654320").id, 1);
  assert.equal(C.duplicate(contacts, "+5511987654320", 1), null);
  assert.equal(C.duplicate(contacts, "11911112222"), null);
});
test("complete slash shortcut expands immediately at the cursor without a submit", () => {
  const templates = [
    {
      shortcut: "pix",
      body: "Olá {{nome}}. Pix {{chave}}",
      values: { chave: "minha-chave" },
    },
  ];
  const result = C.expand("Bom dia /pix", 12, templates, { nome: "Maria" });
  assert.equal(result.text, "Bom dia Olá Maria. Pix minha-chave");
  assert.equal(result.caret, result.text.length);
  assert.equal(C.expand("/pi", 3, templates, {}), null);
  assert.deepEqual(
    C.expand("/pix", 4, [{ shortcut: "pix", body: "{{pix}}" }], {}).missing,
    ["pix"],
  );
});
test("recent list is limited to the active agents last twenty without deleting history", () => {
  const list = Array.from({ length: 25 }, (_, i) => ({
    id: i,
    sessionState: "closed",
    closedReason: "manual",
    assigneeId: "a",
    closedAt: new Date(1000 + i * 1000).toISOString(),
  }));
  list.push({
    id: 99,
    sessionState: "closed",
    closedReason: "manual",
    assigneeId: "other",
    closedAt: new Date(99999).toISOString(),
  });
  const recent = C.recentClosed(list, { id: "a" });
  assert.equal(recent.length, 20);
  assert.equal(recent[0].id, 24);
  assert.equal(recent.at(-1).id, 5);
  assert.equal(list.length, 26);
});
test("unified transfer rejects assigning a person without sector access", () => {
  const c = { sector: "Arte", assigneeId: "a" },
    team = [
      { id: "a", role: "Atendente", allowedSectors: ["Arte"] },
      { id: "b", role: "Atendente", allowedSectors: ["Financeiro"] },
    ];
  C.transfer(c, "Financeiro", "b", { team, sectors });
  assert.equal(c.assigneeId, "b");
  assert.throws(() => C.transfer(c, "Financeiro", "a", { team, sectors }));
  C.transfer(c, "Arte", "", { team, sectors });
  assert.equal(c.assigneeId, null);
});
test("visual statuses distinguish pending, current, ending and closed sessions", () => {
  const now = Date.now(),
    c = {
      sessionState: "open",
      lastInboundAt: new Date(now).toISOString(),
      waitingSince: null,
    };
  assert.equal(C.cardState(c, now), "current");
  c.waitingSince = new Date(now).toISOString();
  assert.equal(C.cardState(c, now), "waiting");
  c.waitingSince = null;
  c.lastInboundAt = new Date(now - 23 * 3600000).toISOString();
  assert.equal(C.cardState(c, now), "ending");
  c.sessionState = "closed";
  assert.equal(C.cardState(c, now), "closed");
});
test("first-response metric is stable for a session and resets on a new session", () => {
  const now = Date.now(),
    c = {
      id: 1,
      name: "Cliente",
      sessionState: "open",
      sessionStartedAt: new Date(now).toISOString(),
      lastInboundAt: new Date(now).toISOString(),
    };
  M.send(c, "Olá", { id: "a", name: "André" }, now + 60000);
  assert.equal(c.firstResponseDelayMs, 60000);
  M.send(c, "Tudo bem?", { id: "a", name: "André" }, now + 120000);
  assert.equal(c.firstResponseDelayMs, 60000);
  M.close(c, "manual", "a", now + 130000);
  M.receive(c, "Voltei", now + 150000);
  assert.equal(c.firstResponseAt, null);
  assert.equal(c.startedByName, "Cliente");
});
test("a last administrator cannot be demoted", () => {
  assert.equal(
    C.canChangeRole([{ id: "a", role: "Administrador" }], "a", "Atendente"),
    false,
  );
  assert.equal(
    C.canChangeRole(
      [
        { id: "a", role: "Administrador" },
        { id: "b", role: "Administrador" },
      ],
      "a",
      "Atendente",
    ),
    true,
  );
});
test("explicit international numbers retain their country code", () => {
  assert.equal(C.phoneKey("+1 (212) 555-0100"), "12125550100");
  assert.equal(C.phoneKey("0012125550100"), "12125550100");
});
