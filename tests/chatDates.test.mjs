import test from "node:test";
import assert from "node:assert/strict";
import {
  dayKey,
  dayLabel,
  groupMessagesByDay,
} from "../src/services/chatDates.mjs";
test("day labels use local calendar days across midnight", () => {
  const now = new Date(2026, 10, 10, 0, 30);
  assert.equal(dayLabel(new Date(2026, 10, 10, 0, 1), now), "Hoje");
  assert.equal(dayLabel(new Date(2026, 10, 9, 23, 59), now), "Ontem");
  assert.equal(dayLabel(new Date(2026, 10, 8), now), "8 de novembro de 2026");
});
test("groups preserve message order, source references and unknown historic dates", () => {
  const messages = [
    { id: "a", createdAt: new Date(2026, 10, 9, 23, 59).toISOString() },
    { id: "b", createdAt: new Date(2026, 10, 10, 0, 1).toISOString() },
    { id: "c", createdAt: new Date(2026, 10, 10, 12).toISOString() },
    "Antigo sem data",
  ];
  const groups = groupMessagesByDay(messages);
  assert.equal(groups.length, 3);
  assert.equal(groups[1].messages.length, 2);
  assert.equal(groups[1].messages[0].message, messages[1]);
  assert.equal(groups[1].messages[0].index, 1);
  assert.equal(dayLabel(groups[2].date), "Registros anteriores");
  assert.equal(dayKey("inválida"), null);
  assert.deepEqual(groupMessagesByDay([]), []);
});
