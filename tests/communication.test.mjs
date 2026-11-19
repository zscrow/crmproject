import test from "node:test";
import assert from "node:assert/strict";
import { createCrmStore, initialState } from "../src/store.mjs";
import { appendInbound } from "../server/crm/inbound.mjs";
import { visibleState } from "../server/crm/workspaces.mjs";
import {
  recordCommunication,
  recordInboundStop,
  recipientKey,
  blockedFor,
  grantFor,
  templatePermissionError,
  stopScope,
} from "../src/domain/communication.mjs";
const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
};
const admin = { id: "admin", name: "Administrador", role: "Administrador" };
const contact = { id: 1, phone: "+55 (11) 99999-9999" };
const time = Date.parse("2026-11-19T15:00:00Z");
const input = (scope = "UTILITY", extra = {}) => ({
  action: "grant",
  scope,
  source: "form",
  occurredAt: new Date(time - 10000).toISOString(),
  purpose: "Atualizações sobre o pedido 123",
  evidence: "Formulário de adesão do pedido 123",
  ...extra,
});
test("purpose-specific consent needs evidence; an inbound chat or an internal flag is not marketing consent", () => {
  const state = {};
  assert.match(templatePermissionError(state, contact, "UTILITY"), /Registre/);
  assert.throws(() =>
    recordCommunication(state, contact, input("ALL"), admin, time),
  );
  assert.throws(() =>
    recordCommunication(state, contact, input("__proto__"), admin, time),
  );
  assert.throws(
    () =>
      recordCommunication(
        state,
        contact,
        input("UTILITY", { evidence: "sim" }),
        admin,
        time,
      ),
    /evidência/,
  );
  assert.throws(
    () =>
      recordCommunication(
        state,
        contact,
        input("UTILITY", { occurredAt: new Date(time + 1).toISOString() }),
        admin,
        time,
      ),
    /futuro/,
  );
  assert.throws(
    () =>
      recordCommunication(
        state,
        contact,
        input(),
        { ...admin, role: "Atendente" },
        time,
      ),
    /administradores/,
  );
  const event = recordCommunication(state, contact, input(), admin, time);
  assert.equal(grantFor(state, contact, "UTILITY").id, event.id);
  assert.equal(templatePermissionError(state, contact, "UTILITY"), "");
  assert.match(
    templatePermissionError(state, contact, "MARKETING"),
    /Registre/,
  );
  assert.equal(blockedFor(state, contact), null);
});
test("withdrawal survives phone aliases, new inbound, reload and requires newer evidence to resume", () => {
  const storage = memory();
  let now = time;
  const store = createCrmStore({ storage, now: () => now });
  const c = store.getSnapshot().contacts[0];
  store.actions.recordCommunication(c.id, input("UTILITY"));
  store.actions.recordCommunication(
    c.id,
    input("MARKETING", {
      action: "revoke",
      occurredAt: new Date(time - 5000).toISOString(),
    }),
  );
  assert.equal(blockedFor(store.getSnapshot(), c), null);
  store.actions.send(c.id, "Resposta de atendimento");
  store.actions.receive(c.id, "SAIR");
  now += 2000;
  store.actions.receive(c.id, "Olá, posso perguntar algo?");
  assert.throws(() => store.actions.send(c.id, "Não pode"), /interrupção/);
  const reloaded = createCrmStore({ storage, now: () => now });
  assert.ok(blockedFor(reloaded.getSnapshot(), c));
  assert.equal(grantFor(reloaded.getSnapshot(), c, "UTILITY"), null);
  const alias = { id: 999, waSenderId: recipientKey(c).slice(6) };
  assert.ok(
    blockedFor(reloaded.getSnapshot(), alias),
    "a recreated contact or omitted Brazilian ninth digit must not bypass suppression",
  );
  assert.throws(
    () =>
      reloaded.actions.recordCommunication(
        c.id,
        input("UTILITY", { resume: true }),
      ),
    /posterior/,
  );
  assert.throws(
    () =>
      reloaded.actions.recordCommunication(
        c.id,
        input("UTILITY", { occurredAt: new Date(now - 1).toISOString() }),
      ),
    /retomada/,
  );
  reloaded.actions.recordCommunication(
    c.id,
    input("UTILITY", {
      resume: true,
      occurredAt: new Date(now - 1).toISOString(),
    }),
  );
  assert.ok(
    blockedFor(reloaded.getSnapshot(), c),
    "utility reauthorization does not authorize free-form service replies",
  );
  assert.ok(grantFor(reloaded.getSnapshot(), c, "UTILITY"));
  assert.equal(grantFor(reloaded.getSnapshot(), c, "MARKETING"), null);
  now += 2000;
  reloaded.actions.recordCommunication(
    c.id,
    input("SERVICE", {
      resume: true,
      occurredAt: new Date(now - 1).toISOString(),
      purpose: "Responder à nova solicitação do cliente",
    }),
  );
  assert.equal(blockedFor(reloaded.getSnapshot(), c), null);
});
test("exact opt-out phrases preserve scope and cannot accidentally trigger from ordinary sentences", () => {
  for (const text of [" SAIR! ", "Não quero receber mensagens.", "STOP"])
    assert.equal(stopScope(text), "ALL");
  assert.equal(stopScope("não quero receber ofertas"), "MARKETING");
  for (const text of [
    "não quero sair",
    "vou sair para almoçar",
    "parar de imprimir",
    "",
  ])
    assert.equal(stopScope(text), null);
  assert.equal(recipientKey({ waSenderId: "US.12345678" }), "");
  assert.equal(recipientKey({ phone: "11999999999" }), recipientKey(contact));
});
test("verified inbound projection records an opt-out once and later ordinary inbound never lifts it", () => {
  const state = initialState(memory());
  state.contacts = [];
  state.messages = {};
  const connection = {
    phone_number_id: "phone",
    account_id: "account",
    sector: "Triagem",
  };
  const value = { contacts: [] };
  const msg = {
    id: "stop-1",
    from: "5511999999999",
    type: "text",
    text: { body: "sair" },
    timestamp: String(time / 1000),
  };
  appendInbound(state, value, msg, connection, new Date(time).toISOString());
  appendInbound(state, value, msg, connection, new Date(time).toISOString());
  assert.equal(state.communicationHistory.length, 1);
  assert.ok(blockedFor(state, state.contacts[0]));
  appendInbound(
    state,
    value,
    {
      ...msg,
      id: "next",
      text: { body: "Oi" },
      timestamp: String(time / 1000 + 10),
    },
    connection,
    new Date(time + 10000).toISOString(),
  );
  assert.ok(blockedFor(state, state.contacts[0]));
  assert.equal(state.communicationHistory[0].actorId, null);
});
test("sector visibility does not leak another recipient's evidence or consent history", () => {
  const state = initialState(memory());
  const visible = state.contacts[0],
    hidden = state.contacts[1];
  visible.sector = "Arte";
  hidden.sector = "Triagem";
  state.team.push({
    id: "limited",
    role: "Atendente",
    allowedSectors: ["Arte"],
  });
  recordCommunication(state, visible, input(), admin, time);
  recordCommunication(state, hidden, input("MARKETING"), admin, time);
  const snapshot = visibleState(state, "limited");
  assert.equal(snapshot.communication[recipientKey(hidden)], undefined);
  assert.ok(snapshot.communication[recipientKey(visible)]);
  assert.equal(snapshot.communicationHistory.length, 1);
});
