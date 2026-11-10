function waitingSince(messages, lastInboundAt, sessionId = null) {
  const normalized = messages.filter(
    (m) =>
      m &&
      typeof m === "object" &&
      (!sessionId || !m.sessionId || m.sessionId === sessionId),
  );
  const outbound = normalized
    .filter((m) => m.direction === "outbound" && m.type !== "template")
    .reduce((n, m) => Math.max(n, Date.parse(m.createdAt) || 0), 0);
  const pending = normalized
    .filter(
      (m) => m.direction === "inbound" && Date.parse(m.createdAt) > outbound,
    )
    .map((m) => Date.parse(m.createdAt));
  if (pending.length) return new Date(Math.min(...pending)).toISOString();
  return Date.parse(lastInboundAt) > outbound ? lastInboundAt : null;
}
function waitMs(c, now = Date.now()) {
  return c.sessionState === "open" && c.waitingSince
    ? Math.max(0, now - Date.parse(c.waitingSince))
    : 0;
}
function isWaiting(c) {
  return (
    c.sessionState === "open" && Number.isFinite(Date.parse(c.waitingSince))
  );
}
function claim(c, actor) {
  if (!actor?.id) throw new Error("Atendente inválido.");
  c.assigneeId = actor.id;
  return c;
}
function transfer(c, mode, destination, { team, sectors }) {
  if (mode === "person") {
    const agent = team.find((a) => a.id === destination);
    if (!agent) throw new Error("Escolha um atendente válido.");
    c.assigneeId = agent.id;
    if (sectors.includes(agent.sector)) c.sector = agent.sector;
  } else if (mode === "sector") {
    if (!sectors.includes(destination))
      throw new Error("Escolha um setor válido.");
    c.sector = destination;
    c.assigneeId = null;
  } else throw new Error("Tipo de transferência inválido.");
  return c;
}
function variables(body) {
  return [
    ...new Set(
      [...String(body).matchAll(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu)].map(
        (m) => m[1],
      ),
    ),
  ];
}
function compile(body, values) {
  const missing = variables(body).filter(
    (k) => !String(values[k] ?? "").trim(),
  );
  return {
    missing,
    text: String(body).replace(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu, (_, key) =>
      String(values[key] ?? ""),
    ),
  };
}
const model = {
  waitingSince,
  waitMs,
  isWaiting,
  claim,
  transfer,
  variables,
  compile,
};
export default model;
export { waitingSince, waitMs, isWaiting, claim, transfer, variables, compile };
