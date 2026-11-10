const isAdmin = (agent) => agent?.role === "Administrador";
const allowedSectors = (agent, sectors) =>
  isAdmin(agent)
    ? [...sectors]
    : sectors.filter((s) =>
        (agent?.allowedSectors || [agent?.sector]).includes(s),
      );
const canViewSector = (agent, sector) =>
  isAdmin(agent) || (agent?.allowedSectors || [agent?.sector]).includes(sector);
const canViewContact = (agent, contact) =>
  !!contact && canViewSector(agent, contact.sector);
const capability = (agent, key) =>
  isAdmin(agent) || agent?.capabilities?.[key] === true;
function phoneKey(value) {
  const international = /^\s*(\+|00)/.test(String(value || ""));
  let n = String(value || "").replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (!international && (n.length === 10 || n.length === 11)) n = "55" + n;
  return n;
}
const duplicate = (contacts, value, excludeId = null) => {
  const key = phoneKey(value);
  return key.length >= 8
    ? contacts.find((c) => c.id !== excludeId && phoneKey(c.phone) === key) ||
        null
    : null;
};
function recentClosed(contacts, agent, limit = 20) {
  return contacts
    .filter(
      (c) =>
        c.sessionState === "closed" &&
        c.closedReason !== "not_started" &&
        (c.assigneeId === agent.id || c.closedBy === agent.id),
    )
    .sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt))
    .slice(0, limit);
}
function cardState(c, now = Date.now()) {
  if (c.sessionState === "closed") return "closed";
  const end = Date.parse(c.lastInboundAt) + 86400000;
  if (Number.isFinite(end) && end - now <= 2 * 3600000) return "ending";
  return c.waitingSince ? "waiting" : "current";
}
function expand(text, caret, templates, values) {
  const before = text.slice(0, caret);
  const match = before.match(/(^|\s)\/([\p{L}\p{N}_]+)$/iu);
  if (!match) return null;
  const template = templates.find(
    (t) => !t.archived && t.shortcut.toLowerCase() === match[2].toLowerCase(),
  );
  if (!template) return null;
  const fields = [
    ...new Set(
      [...template.body.matchAll(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu)].map(
        (m) => m[1],
      ),
    ),
  ];
  const available = { ...(template.values || {}), ...values };
  const missing = fields.filter((k) => !String(available[k] ?? "").trim());
  if (missing.length) return { template, missing };
  const expanded = template.body.replace(
    /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu,
    (_, k) => String(available[k] ?? ""),
  );
  const start = caret - match[2].length - 1;
  return {
    template,
    missing: [],
    text: text.slice(0, start) + expanded + text.slice(caret),
    caret: start + expanded.length,
  };
}
function transfer(c, sector, assigneeId, { team, sectors }) {
  if (!sectors.includes(sector)) throw new Error("Escolha um setor válido.");
  if (assigneeId) {
    const agent = team.find((a) => a.id === assigneeId);
    if (!agent || !canViewSector(agent, sector))
      throw new Error("Essa pessoa não tem acesso ao setor escolhido.");
  }
  c.sector = sector;
  c.assigneeId = assigneeId || null;
  return c;
}
function canChangeRole(team, id, role) {
  return (
    role === "Administrador" || team.some((a) => a.id !== id && isAdmin(a))
  );
}
const model = {
  isAdmin,
  allowedSectors,
  canViewSector,
  canViewContact,
  capability,
  phoneKey,
  duplicate,
  recentClosed,
  cardState,
  expand,
  transfer,
  canChangeRole,
};
export default model;
export {
  isAdmin,
  allowedSectors,
  canViewSector,
  canViewContact,
  capability,
  phoneKey,
  duplicate,
  recentClosed,
  cardState,
  expand,
  transfer,
  canChangeRole,
};
