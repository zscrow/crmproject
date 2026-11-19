// Product controls for the Messaging Policy. Records document an authorization;
// neither a record nor a checked box establishes that the recipient actually consented.
import Crm from "./crm.mjs";
export const SCOPES = {
  SERVICE: "Respostas de atendimento",
  UTILITY: "Atualizações de pedidos e serviços",
  MARKETING: "Ofertas e recomendações",
  AUTHENTICATION: "Códigos de autenticação",
};
export const SOURCES = {
  whatsapp: "WhatsApp",
  form: "Formulário",
  email: "E-mail",
  phone: "Telefone",
  in_person: "Presencial",
  other: "Outro canal",
};
export function recipientKey(contact) {
  if (contact?.waSenderId && !/^\d{8,15}$/.test(contact.waSenderId)) return "";
  let digits = contact?.waSenderId || Crm.phoneKey(contact?.phone);
  if (!/^\d{8,15}$/.test(digits)) return "";
  // Canonicalize the Brazilian mobile variants that Meta may return with/without 9.
  if (/^55\d{2}9\d{8}$/.test(digits))
    digits = digits.slice(0, 4) + digits.slice(5);
  return "phone:" + digits;
}
export function preferencesFor(state, contact) {
  return state.communication?.[recipientKey(contact)] || {};
}
export function blockedFor(state, contact, scope = "SERVICE") {
  const p = preferencesFor(state, contact);
  if (p.blocked?.[scope]) return p.blocked[scope];
  if (
    p.blockedAll &&
    !(
      Date.parse(p.grants?.[scope]?.occurredAt) >
      Date.parse(p.blockedAll.occurredAt)
    )
  )
    return p.blockedAll;
  return null;
}
export function fullyBlocked(state, contact) {
  return Object.keys(SCOPES).every(
    (scope) => !!blockedFor(state, contact, scope),
  );
}
export function grantFor(state, contact, scope) {
  if (!Object.hasOwn(SCOPES, scope) || blockedFor(state, contact, scope))
    return null;
  return preferencesFor(state, contact).grants?.[scope] || null;
}
export function templatePermissionError(state, contact, scope) {
  if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(scope))
    return "Categoria do modelo não suportada.";
  if (blockedFor(state, contact, scope))
    return "Envio bloqueado por pedido de interrupção do cliente.";
  if (!grantFor(state, contact, scope))
    return "Registre a autorização do cliente para esta finalidade antes de enviar.";
  return "";
}
export function recordCommunication(
  state,
  contact,
  input,
  actor,
  now = Date.now(),
) {
  const key = recipientKey(contact);
  if (!key) throw new Error("O contato não tem um telefone válido.");
  const { action, scope, source } = input || {};
  if (
    !["grant", "revoke"].includes(action) ||
    !(Object.hasOwn(SCOPES, scope) || (action === "revoke" && scope === "ALL"))
  )
    throw new Error("Escolha uma finalidade válida.");
  if (action === "grant" && actor?.role !== "Administrador")
    throw new Error("Somente administradores podem registrar uma autorização.");
  if (!Object.hasOwn(SOURCES, source))
    throw new Error("Informe o canal de origem.");
  const evidence = String(input.evidence || "").trim();
  const purpose = String(input.purpose || "").trim();
  const stamp = Date.parse(input.occurredAt);
  if (evidence.length < 10 || evidence.length > 2000)
    throw new Error(
      "Descreva a evidência ou referência do pedido (10 a 2000 caracteres).",
    );
  if (action === "grant" && (purpose.length < 5 || purpose.length > 500))
    throw new Error("Descreva a finalidade autorizada (5 a 500 caracteres).");
  if (!Number.isFinite(stamp) || stamp > now)
    throw new Error("Informe uma data válida, que não esteja no futuro.");
  const p = preferencesFor(state, contact);
  const previous = [
    p.blockedAll,
    ...(scope === "ALL"
      ? [...Object.values(p.blocked || {}), ...Object.values(p.grants || {})]
      : [p.blocked?.[scope], p.grants?.[scope]]),
  ]
    .filter(Boolean)
    .map((e) => Date.parse(e.occurredAt));
  if (previous.some((date) => stamp <= date))
    throw new Error(
      "O registro deve ser posterior ao último pedido desta finalidade.",
    );
  if (action === "grant" && p.blockedAll && input.resume !== true)
    throw new Error(
      "Confirme a retomada somente após uma nova autorização do cliente.",
    );
  const event = {
    id: crypto.randomUUID(),
    recipientKey: key,
    contactId: contact.id,
    action,
    scope,
    source,
    evidence,
    purpose: action === "grant" ? purpose : "",
    occurredAt: new Date(stamp).toISOString(),
    recordedAt: new Date(now).toISOString(),
    actorId: actor.id,
    actorName: actor.name,
  };
  applyEvent(state, event);
  return event;
}
function applyEvent(state, event) {
  state.communication ||= {};
  state.communicationHistory ||= [];
  const p = (state.communication[event.recipientKey] ||= {
    grants: {},
    blocked: {},
  });
  p.grants ||= {};
  p.blocked ||= {};
  if (event.action === "revoke" && event.scope === "ALL") {
    p.blockedAll = event;
    p.grants = {};
    p.blocked = {};
  } else if (event.action === "revoke") {
    p.blocked[event.scope] = event;
    delete p.grants[event.scope];
  } else {
    delete p.blocked[event.scope];
    p.grants[event.scope] = event;
  }
  state.communicationHistory.push(event);
}
export function stopScope(text) {
  const normalized = String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (
    [
      "sair",
      "parar",
      "stop",
      "cancelar mensagens",
      "nao quero receber mensagens",
      "nao quero mais receber mensagens",
      "nao me envie mais mensagens",
      "remover meu numero",
    ].includes(normalized)
  )
    return "ALL";
  if (
    [
      "parar ofertas",
      "cancelar ofertas",
      "nao quero receber ofertas",
      "sair marketing",
    ].includes(normalized)
  )
    return "MARKETING";
  return null;
}
export function recordInboundStop(state, contact, text, messageId, at) {
  const scope = stopScope(text),
    key = recipientKey(contact);
  if (!scope || !key) return;
  const id = "stop:" + messageId;
  if (
    (state.communicationHistory || []).some(
      (e) => e.id === id && e.recipientKey === key,
    )
  )
    return;
  // Fail closed even when a request arrives late. A new inbound message never
  // silently restores permissions; the team must document any renewed consent.
  applyEvent(state, {
    id,
    recipientKey: key,
    contactId: contact.id,
    action: "revoke",
    scope,
    source: "whatsapp_message",
    evidence: "Pedido na mensagem " + messageId,
    purpose: "",
    occurredAt: at,
    recordedAt: new Date().toISOString(),
    actorId: null,
    actorName: "Cliente pelo WhatsApp",
  });
}
