import test from "node:test";
import assert from "node:assert/strict";
import { commandSuggestions, quoteMessage } from "../src/services/chat.mjs";
test("slash suggestions include custom accented shortcuts and exclude archived entries", () => {
  const templates = [
    { id: "1", shortcut: "aprovação", title: "Aprovar arte" },
    { id: "2", shortcut: "pix", title: "Pagamento" },
    { id: "3", shortcut: "antigo", archived: true },
  ];
  assert.equal(commandSuggestions("/", 1, templates).items.length, 2);
  assert.equal(
    commandSuggestions("Texto /aprov", 12, templates).items[0].shortcut,
    "aprovação",
  );
  assert.equal(commandSuggestions("texto", 5, templates), null);
  assert.equal(
    commandSuggestions("/desconhecido", 13, templates).items.length,
    0,
  );
});
test("audio quotation uses a friendly name instead of the technical filename", () => {
  assert.equal(
    quoteMessage(
      {
        senderName: "Cliente",
        text: "audio-1.webm",
        attachments: [{ name: "audio-1.webm", kind: "audio" }],
      },
      "id",
    ).text,
    "Mensagem de voz",
  );
});
