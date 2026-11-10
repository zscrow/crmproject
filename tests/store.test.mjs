import test from "node:test";
import assert from "node:assert/strict";
import { createCrmStore, initialState } from "../src/store.mjs";
const storage = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
};
test("new contacts belong to their creator and duplicate creation retains the history", () => {
  const store = createCrmStore({ storage: storage() });
  const { contact } = store.actions.saveContact({
    name: "Teste React",
    phone: "11922223333",
    sector: "Arte",
  });
  assert.equal(contact.assigneeId, "saulo");
  assert.equal(contact.lastInboundAt, null);
  assert.equal(contact.closedReason, "not_started");
  const result = store.actions.saveContact({
    name: "Outro nome",
    phone: "+55 (11) 92222-3333",
    sector: "Arte",
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.contact.id, contact.id);
});
test("transfer, message author and important-only audit survive reload", () => {
  const memory = storage(),
    store = createCrmStore({ storage: memory });
  store.actions.transfer(1, "Financeiro", "luiza");
  assert.throws(() => store.actions.send(1, "Sem assumir"));
  store.actions.claim(1);
  store.actions.send(1, "Mensagem de teste");
  store.actions.setTheme("dark");
  const next = createCrmStore({ storage: memory });
  assert.equal(next.getSnapshot().messages[1].at(-1).senderName, "André Saulo");
  assert.equal(next.getSnapshot().contacts[0].sector, "Financeiro");
  assert.equal(
    next.getSnapshot().audit.some((e) => e.action.includes("theme")),
    false,
  );
});
test("expired conversation requires a template and template does not reopen the window", () => {
  let time = Date.now();
  const store = createCrmStore({ storage: storage(), now: () => time });
  time += 86400001;
  store.actions.expire();
  assert.throws(() => store.actions.send(1, "Texto livre"));
  store.actions.sendTemplate(1, "wa-return-example", {}, true);
  assert.equal(store.getSnapshot().contacts[0].sessionState, "closed");
});
