import test from "node:test";
import assert from "node:assert/strict";
import S from "../src/domain/service.mjs";
import M from "../src/domain/session.mjs";
const now = Date.UTC(2026, 10, 9, 12);
const iso = (n) => new Date(now + n).toISOString();
test("waiting time starts at the first pending customer message", () => {
  const records = [
    { direction: "outbound", createdAt: iso(1000) },
    { direction: "inbound", createdAt: iso(2000) },
    { direction: "inbound", createdAt: iso(3000) },
  ];
  assert.equal(S.waitingSince(records, iso(3000)), iso(2000));
  const c = { sessionState: "open", waitingSince: iso(2000) };
  assert.equal(S.waitMs(c, now + 6000), 4000);
});
test("reply clears waiting; later inbound starts another waiting period", () => {
  const c = {
    id: 1,
    name: "Cliente",
    sessionState: "open",
    sessionId: "s",
    lastInboundAt: iso(0),
    waitingSince: iso(0),
  };
  M.send(c, "Oi", { id: "a", name: "André" }, now + 1000);
  assert.equal(c.waitingSince, null);
  M.receive(c, "Obrigada", now + 2000);
  assert.equal(c.waitingSince, iso(2000));
  M.receive(c, "Mais uma dúvida", now + 3000);
  assert.equal(c.waitingSince, iso(2000));
  assert.equal(c.assigneeId, "a");
});
test("claim and transfer change ownership without changing the messaging window", () => {
  const c = { lastInboundAt: iso(0), sector: "Arte", assigneeId: null };
  const team = [
      { id: "a", name: "André", sector: "Triagem" },
      { id: "b", name: "Luiza", sector: "Arte" },
    ],
    sectors = ["Arte", "Triagem"];
  S.claim(c, team[0]);
  assert.equal(c.assigneeId, "a");
  S.transfer(c, "person", "b", { team, sectors });
  assert.equal(c.assigneeId, "b");
  assert.equal(c.sector, "Arte");
  S.transfer(c, "sector", "Triagem", { team, sectors });
  assert.equal(c.assigneeId, null);
  assert.equal(c.sector, "Triagem");
  assert.equal(c.lastInboundAt, iso(0));
  assert.throws(() =>
    S.transfer(c, "person", "inexistente", { team, sectors }),
  );
});
test("personalized replies identify missing variables and preserve literal content", () => {
  assert.deepEqual(S.variables("{{nome}} {{pix}} {{pix}}"), ["nome", "pix"]);
  const missing = S.compile("Olá {{nome}}. Pix: {{pix}}", { nome: "Maria" });
  assert.deepEqual(missing.missing, ["pix"]);
  assert.equal(
    S.compile("{{nome}}: {{pix}}", { nome: "Maria", pix: "chave$literal" })
      .text,
    "Maria: chave$literal",
  );
});
test("closed conversations do not continue accumulating waiting time", () => {
  const c = { sessionState: "closed", waitingSince: iso(0) };
  assert.equal(S.waitMs(c, now + 10000), 0);
  assert.equal(S.isWaiting(c), false);
});
test("a reopened session does not inherit waiting time from an old session", () => {
  const records = [
    { direction: "inbound", createdAt: iso(-90000000), sessionId: "old" },
    { direction: "inbound", createdAt: iso(0), sessionId: "current" },
  ];
  assert.equal(S.waitingSince(records, iso(0), "current"), iso(0));
});
