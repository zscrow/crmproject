import Session from "../domain/session.mjs";
export function messageKey(message, index) {
  return message?.id || `legacy-${index}`;
}
export function quoteMessage(message, id) {
  const m = Session.normalize(message);
  let text = m.text || "";
  const attachments = m.attachments || [];
  if (!text || attachments.some((a) => a.name === text))
    text =
      attachments.length > 1
        ? `${attachments.length} anexos`
        : {
            audio: "Mensagem de voz",
            image: "Imagem",
            video: "Vídeo",
            sticker: "Figurinha",
            document: "Documento",
          }[attachments[0]?.kind] || "Mensagem";
  return {
    messageId: id,
    senderName: m.senderName || "Atendente não registrado",
    text: text.slice(0, 500),
  };
}
const fold = (value) =>
  String(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function commandSuggestions(text, caret, templates) {
  const match = text.slice(0, caret).match(/(^|\s)\/([\p{L}\p{N}_]*)$/u);
  if (!match) return null;
  const query = fold(match[2]);
  return {
    start: caret - match[2].length - 1,
    end: caret,
    items: templates.filter(
      (t) =>
        !t.archived &&
        (fold(t.shortcut).includes(query) || fold(t.title).includes(query)),
    ),
  };
}
