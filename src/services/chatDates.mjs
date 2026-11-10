import Session from "../domain/session.mjs";
export function dayKey(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dayLabel(value, now = Date.now()) {
  if (!value) return "Registros anteriores";
  const date = new Date(value);
  if (dayKey(date) === dayKey(now)) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
export function groupMessagesByDay(messages) {
  const groups = [];
  messages.forEach((message, index) => {
    const date = Session.normalize(message)?.createdAt;
    const key = dayKey(date) || "unknown";
    let group = groups.at(-1);
    if (!group || group.day !== key) {
      group = {
        id: `${key}-${index}`,
        day: key,
        date: key === "unknown" ? null : date,
        messages: [],
      };
      groups.push(group);
    }
    group.messages.push({ message, index });
  });
  return groups;
}
