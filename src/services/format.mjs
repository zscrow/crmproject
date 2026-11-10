export function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "menos de 1 min";
  return min < 60
    ? `${min} min`
    : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`;
}
export function remaining(contact, now = Date.now()) {
  const end = Date.parse(contact.lastInboundAt) + 86400000;
  if (!Number.isFinite(end) || end <= now) return "Janela encerrada";
  const min = Math.ceil((end - now) / 60000);
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min restantes`;
}
export function bytes(size) {
  return size >= 1048576
    ? (size / 1048576).toFixed(1) + " MB"
    : Math.max(1, Math.round(size / 1024)) + " KB";
}
export function download(data, name, type = "application/json") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(contacts) {
  return (
    "\uFEFF" +
    [
      ["Nome", "Empresa", "Telefone", "E-mail", "Etiqueta", "Setor"],
      ...contacts.map((c) => [
        c.name,
        c.company,
        c.phone,
        c.email,
        c.tag,
        c.sector,
      ]),
    ]
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v || "")
                .replace(/^[=+\-@]/, "'$&")
                .replace(/"/g, '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n")
  );
}
