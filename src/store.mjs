import { messageKey, quoteMessage } from "./services/chat.mjs";
import Session from "./domain/session.mjs";
import Service from "./domain/service.mjs";
import Crm from "./domain/crm.mjs";

const KEYS = {
  contacts: "zc-contacts",
  sectors: "zc-sectors",
  profile: "zc-profile",
  team: "zc-team",
  activeAgentId: "zc-active-agent",
  theme: "zc-theme",
  quickReplies: "zc-quick-replies",
  waTemplates: "zc-wa-templates",
  reminders: "zc-reminders",
  folders: "zc-folders",
  audit: "zc-audit",
  messages: "zc-messages",
  serviceSort: "zc-service-sort",
};
export const DEFAULT_SECTORS = [
  "Arte",
  "Impressão",
  "Financeiro",
  "E-commerce",
  "Triagem",
];
const copy = (value) => structuredClone(value);
const uid = () => crypto.randomUUID();
export function read(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
export function mediaSummary(files) {
  return files.length > 1
    ? `${files.length} anexos`
    : {
        audio: "Mensagem de voz",
        image: "Imagem",
        video: "Vídeo",
        sticker: "Figurinha",
        document: "Documento",
      }[files[0]?.kind] || "Anexo";
}
export function initialState(storage, now = Date.now()) {
  const seedNames = [
    ["Mariana Costa", "Aurora Design", "Cliente", "Arte", "purple"],
    ["Rafael Almeida", "Almeida & Associados", "Lead", "Triagem", "blue"],
    ["Juliana Santos", "Studio Juliana", "Cliente", "Arte", "rose"],
    ["Pedro Oliveira", "Oliveira Tech", "Lead", "Triagem", "orange"],
    ["Camila Rodrigues", "CR Consultoria", "VIP", "Financeiro", "green"],
    ["Lucas Ferreira", "Ferreira Arquitetura", "Cliente", "Impressão", "blue"],
    ["Beatriz Lima", "Bloom Marketing", "Lead", "E-commerce", "rose"],
    ["André Martins", "Martins Logística", "VIP", "Financeiro", "purple"],
  ];
  const previews = [
    "Olá! Gostaria de um orçamento para o novo projeto.",
    "Consegue me enviar mais detalhes da proposta?",
    "Obrigada pelo retorno. Vou conferir o material.",
    "Podemos conversar sobre os planos disponíveis?",
    "Fico no aguardo da confirmação.",
    "Tudo resolvido, muito obrigado!",
    "Você tem uma previsão para me passar?",
    "Assim que tiver a confirmação, aviso por aqui.",
  ];
  const seeded = seedNames.map(([name, company, tag, sector, color], i) => ({
    id: i + 1,
    name,
    company,
    tag,
    sector,
    color,
    initials: name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join(""),
    phone: `+55 (11) 9${87654320 + i}`,
    email: name.split(" ")[0].toLowerCase() + "@empresa.com.br",
    favorite: i === 0,
    assigneeId: i === 0 ? "saulo" : i % 2 ? "luiza" : "bruno",
    lastInboundAt: new Date(
      now - [5, 12, 28, 60, 120, 180, 26 * 60, 28 * 60][i] * 60000,
    ).toISOString(),
    sessionId: "session-" + (i + 1),
    sessionState: i < 6 ? "open" : "closed",
    closedReason: i >= 6 ? "window_expired" : undefined,
    closedAt: i >= 6 ? new Date(now).toISOString() : undefined,
    preview: previews[i],
    queueState: i < 6 ? "Sem resposta" : "Concluído",
  }));
  const state = Object.fromEntries(
    Object.entries(KEYS).map(([name, key]) => [name, read(storage, key, null)]),
  );
  state.sectors ||= [...DEFAULT_SECTORS];
  state.profile ||= {
    name: "André Saulo",
    email: "andre@empresa.com.br",
    company: "Minha empresa",
  };
  state.team ||= [
    {
      id: "saulo",
      name: "André Saulo",
      role: "Administrador",
      sector: "Triagem",
      allowedSectors: [...state.sectors],
    },
    {
      id: "andre",
      name: "André Silva",
      role: "Atendente",
      sector: "Arte",
      allowedSectors: ["Arte"],
    },
    {
      id: "luiza",
      name: "Luiza Fernandes",
      role: "Atendente",
      sector: "Arte",
      allowedSectors: ["Arte", "Financeiro"],
    },
    {
      id: "bruno",
      name: "Bruno Souza",
      role: "Atendente",
      sector: "Impressão",
      allowedSectors: ["Impressão"],
    },
  ];
  if (!state.team.some((a) => a.role === "Administrador"))
    state.team.push({
      id: "saulo",
      name: "André Saulo",
      role: "Administrador",
      sector: "Triagem",
      allowedSectors: [...state.sectors],
    });
  state.activeAgentId = state.team.some((a) => a.id === state.activeAgentId)
    ? state.activeAgentId
    : state.team.find((a) => a.name === "André Saulo")?.id || state.team[0].id;
  state.contacts ||= seeded;
  state.messages ||= {};
  state.theme ||= "light";
  state.serviceSort ||= "unanswered";
  state.reminders ||= [];
  state.audit ||= [];
  state.folders ||= [
    { id: "quotes", name: "Orçamentos", color: "#73a4d8" },
    { id: "followup", name: "Retornar contato", color: "#e2b470" },
  ];
  state.quickReplies ||= [
    {
      id: "pix",
      kind: "quick",
      title: "Dados do Pix",
      shortcut: "pix",
      body: "Olá, {{nome}}! Seguem os dados para pagamento:\nChave Pix: {{chave_pix}}\nFavorecido: {{favorecido}}\nApós pagar, envie o comprovante por aqui.",
      values: { chave_pix: "", favorecido: "" },
    },
    {
      id: "welcome",
      kind: "quick",
      title: "Boas-vindas",
      shortcut: "ola",
      body: "Olá, {{nome}}! Sou {{atendente}}, da {{empresa}}. Como posso ajudar?",
      values: {},
    },
    {
      id: "art",
      kind: "quick",
      title: "Aprovação da arte",
      shortcut: "arte",
      body: "Olá, {{nome}}! Sua arte está pronta para aprovação. Podemos seguir com a impressão?",
      values: {},
    },
  ];
  state.waTemplates ||= [
    {
      id: "wa-return-example",
      kind: "whatsapp",
      title: "Retorno ao cliente",
      name: "retorno_cliente_exemplo",
      body: "Olá, {{nome}}! Aqui é {{atendente}}, da {{empresa}}. Podemos continuar seu atendimento?",
      values: {},
      category: "Utilidade",
      language: "pt_BR",
      status: "example",
    },
  ];
  for (const a of state.team) {
    a.allowedSectors ??=
      a.role === "Administrador" ? [...state.sectors] : [a.sector];
    a.capabilities ??= {};
  }
  for (const c of state.contacts) {
    c.initials ||= c.name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("");
    c.sessionId ||= "session-" + c.id;
    c.sessionState ||= c.lastInboundAt ? "open" : "closed";
    c.closedReason ||= c.sessionState === "closed" ? "not_started" : undefined;
    const messages = (state.messages[c.id] ||= []);
    if (!storage.getItem(KEYS.contacts) && c.lastInboundAt)
      messages.push({
        id: "seed-" + c.id,
        direction: "inbound",
        senderName: c.name,
        text: c.preview,
        createdAt: c.lastInboundAt,
        sessionId: c.sessionId,
      });
    const records = messages
      .map(Session.normalize)
      .filter(
        (m) => m.createdAt && (!m.sessionId || m.sessionId === c.sessionId),
      )
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    c.sessionStartedAt ??=
      records[0]?.createdAt || c.lastInboundAt || c.createdAt || null;
    c.startedByName ??=
      records[0]?.senderName || c.createdByName || "Não registrado";
    c.waitingSince ??= Service.waitingSince(
      messages,
      c.lastInboundAt,
      c.sessionId,
    );
    const first = records.find(
      (m) => m.direction === "outbound" && m.type !== "template",
    );
    c.firstResponseAt ??= first?.createdAt || null;
    c.firstResponseDelayMs ??=
      c.firstResponseAt && c.sessionStartedAt
        ? Math.max(
            0,
            Date.parse(c.firstResponseAt) - Date.parse(c.sessionStartedAt),
          )
        : null;
  }
  return state;
}
export function actorOf(state) {
  return state.team.find((a) => a.id === state.activeAgentId) || state.team[0];
}
export function visibleContacts(state) {
  return state.contacts.filter((c) => Crm.canViewContact(actorOf(state), c));
}
export function createCrmStore({
  storage = window.localStorage,
  now = () => Date.now(),
  seed,
} = {}) {
  let state = seed ? copy(seed) : initialState(storage, now());
  const listeners = new Set();
  function persist(next, previous = {}) {
    for (const [key, storageKey] of Object.entries(KEYS))
      if (JSON.stringify(next[key]) !== JSON.stringify(previous[key]))
        storage.setItem(storageKey, JSON.stringify(next[key]));
  }
  function audit(
    next,
    category,
    action,
    description,
    c = null,
    details = {},
    system = false,
  ) {
    const actor = actorOf(next);
    next.audit.push({
      id: uid(),
      at: new Date(now()).toISOString(),
      category,
      action,
      description,
      actorId: system ? null : actor.id,
      actorName: system ? "Sistema" : actor.name,
      contactId: c?.id || null,
      contactName: c?.name || null,
      details,
    });
  }
  function commit(change) {
    const next = copy(state);
    const result = change(next);
    persist(next, state);
    state = next;
    listeners.forEach((fn) => fn());
    return result;
  }
  function allowed(next, id) {
    const c = next.contacts.find((c) => c.id === id);
    if (!c || !Crm.canViewContact(actorOf(next), c))
      throw new Error("Seu perfil não tem acesso a esse cliente.");
    return c;
  }
  function admin(next) {
    if (!Crm.isAdmin(actorOf(next)))
      throw new Error("Somente administradores podem fazer essa alteração.");
  }
  function append(next, c, message) {
    (next.messages[c.id] ??= []).push(message);
  }
  function systemMessage(next, c, text) {
    append(next, c, {
      id: uid(),
      direction: "system",
      text,
      createdAt: new Date(now()).toISOString(),
      sessionId: c.sessionId,
    });
  }
  const actions = {
    setAgent(id) {
      return commit((n) => {
        if (!n.team.some((a) => a.id === id))
          throw new Error("Atendente inválido.");
        n.activeAgentId = id;
        audit(
          n,
          "Login",
          "identidade_simulada",
          "Atendente em uso alterado (simulação, sem login real)",
        );
      });
    },
    setTheme(theme) {
      return commit((n) => {
        n.theme = theme;
      });
    },
    setSort(sort) {
      return commit((n) => {
        n.serviceSort = sort;
      });
    },
    expire() {
      const expired = state.contacts.filter(
        (c) => c.sessionState === "open" && !Session.canReply(c, now()),
      );
      if (!expired.length) return 0;
      return commit((n) => {
        for (const c of n.contacts)
          if (c.sessionState === "open" && !Session.canReply(c, now())) {
            Session.close(c, "window_expired", null, now());
            audit(
              n,
              "Conversas",
              "atendimento_finalizado",
              "Finalizado automaticamente após 24h",
              c,
              {},
              true,
            );
          }
        return expired.length;
      });
    },
    claim(id) {
      return commit((n) => {
        const c = allowed(n, id),
          previous =
            n.team.find((a) => a.id === c.assigneeId)?.name || "Sem atendente";
        Crm.canViewSector(actorOf(n), c.sector);
        Service.claim(c, actorOf(n));
        audit(
          n,
          "Conversas",
          "responsabilidade_alterada",
          "Atendimento assumido",
          c,
          { de: previous, para: actorOf(n).name },
        );
      });
    },
    transfer(id, sector, person, note = "") {
      return commit((n) => {
        const c = allowed(n, id),
          old =
            n.team.find((a) => a.id === c.assigneeId)?.name || "Sem atendente";
        Crm.transfer(c, sector, person, { team: n.team, sectors: n.sectors });
        const target =
          n.team.find((a) => a.id === person)?.name || "equipe do setor";
        systemMessage(
          n,
          c,
          `${actorOf(n).name} transferiu para ${target} · ${sector}.${note ? " " + note : ""}`,
        );
        audit(
          n,
          "Conversas",
          "responsabilidade_alterada",
          "Atendimento transferido",
          c,
          { de: old, para: target, setorAtual: sector },
        );
      });
    },
    close(id) {
      return commit((n) => {
        const c = allowed(n, id);
        if (Session.close(c, "manual", actorOf(n).id, now())) {
          systemMessage(n, c, `Atendimento finalizado por ${actorOf(n).name}.`);
          audit(
            n,
            "Conversas",
            "atendimento_finalizado",
            "Atendimento finalizado",
            c,
          );
        }
      });
    },
    reopen(id) {
      return commit((n) => {
        const c = allowed(n, id);
        if (!Session.reopen(c, now()))
          throw new Error(
            "A janela terminou. Aguarde o cliente ou use um modelo aprovado.",
          );
        systemMessage(n, c, `Atendimento reaberto por ${actorOf(n).name}.`);
        audit(
          n,
          "Conversas",
          "atendimento_reaberto",
          "Atendimento reaberto",
          c,
        );
      });
    },
    receive(id, text) {
      return commit((n) => {
        admin(n);
        const c = allowed(n, id),
          closed = c.sessionState !== "open";
        append(n, c, Session.receive(c, text, now()));
        if (closed)
          audit(
            n,
            "Conversas",
            "atendimento_reaberto",
            "Atendimento reaberto com retorno do cliente",
            c,
          );
      });
    },
    send(id, text, attachments = [], expectedAgent, replyId = null) {
      return commit((n) => {
        const c = allowed(n, id),
          actor = actorOf(n);
        if (expectedAgent && actor.id !== expectedAgent)
          throw new Error(
            "O atendente mudou. Revise a mensagem antes de enviar.",
          );
        const message = Session.send(
          c,
          text.trim() || mediaSummary(attachments),
          actor,
          now(),
        );
        if (replyId) {
          const source = (n.messages[c.id] || []).find(
            (m, i) => messageKey(m, i) === replyId,
          );
          if (!source || Session.normalize(source).direction === "system")
            throw new Error(
              "A mensagem citada não está disponível nesta conversa.",
            );
          message.replyTo = quoteMessage(source, replyId);
        }
        message.id = uid();
        message.text = text.trim();
        message.attachments = attachments;
        message.type = attachments.length ? "media" : "text";
        message.delivery = "simulation";
        message.signedText =
          actor.name + ":\n" + (message.text || mediaSummary(attachments));
        if (!message.text) c.preview = mediaSummary(attachments);
        c.templatePending = false;
        append(n, c, message);
        audit(
          n,
          "Conversas",
          "mensagem_local",
          "Mensagem registrada no protótipo",
          c,
          {
            messageId: message.id,
            autor: actor.name,
            tipo: message.type,
            anexos: attachments.map((a) => ({
              nome: a.name,
              tipo: a.kind,
              tamanho: a.size,
            })),
          },
        );
        return message;
      });
    },
    sendTemplate(id, templateId, values, consent) {
      return commit((n) => {
        const c = allowed(n, id),
          t = n.waTemplates.find((t) => t.id === templateId && !t.archived);
        if (!t) throw new Error("Modelo não encontrado.");
        const compiled = Service.compile(t.body, {
          ...(t.values || {}),
          nome: c.name,
          atendente: actorOf(n).name,
          empresa: n.profile.company,
          ...values,
        });
        if (compiled.missing.length)
          throw new Error("Preencha: " + compiled.missing.join(", "));
        const message = Session.simulateTemplate(
          c,
          t,
          compiled.text,
          actorOf(n),
          consent,
          now(),
        );
        message.id = uid();
        append(n, c, message);
        audit(
          n,
          "Conversas",
          "modelo_simulado",
          "Envio de modelo simulado; nenhuma cobrança ou envio real",
          c,
          { modelo: t.title },
        );
        return message;
      });
    },
    saveNote(id, note) {
      return commit((n) => {
        const c = allowed(n, id);
        if ((c.note || "") === note.trim()) return;
        c.note = note.trim();
        audit(
          n,
          "Conversas",
          "nota_editada",
          "Anotação do cliente atualizada",
          c,
        );
      });
    },
    saveContact(data, id) {
      return commit((n) => {
        const actor = actorOf(n),
          duplicate = Crm.duplicate(n.contacts, data.phone, id);
        if (duplicate) {
          if (!Crm.canViewContact(actor, duplicate))
            throw new Error("Este telefone já está cadastrado em outro setor.");
          return { contact: duplicate, duplicate: true };
        }
        const key = Crm.phoneKey(data.phone);
        if (!data.name.trim() || key.length < 8 || key.length > 15)
          throw new Error("Informe nome e telefone válidos.");
        if (!Crm.canViewSector(actor, data.sector))
          throw new Error("Setor não permitido.");
        const initials = data.name
          .trim()
          .split(/\s+/)
          .map((s) => s[0])
          .slice(0, 2)
          .join("");
        let c;
        if (id) {
          c = allowed(n, id);
          Object.assign(c, data, { name: data.name.trim(), initials });
          audit(
            n,
            "Administrativo",
            "cliente_atualizado",
            "Cliente atualizado",
            c,
          );
        } else {
          const stamp = new Date(now()).toISOString(),
            newId = Math.max(now(), ...n.contacts.map((c) => c.id + 1));
          c = {
            ...data,
            id: newId,
            name: data.name.trim(),
            initials,
            color: ["purple", "blue", "rose", "orange", "green"][
              n.contacts.length % 5
            ],
            favorite: false,
            assigneeId: actor.id,
            createdById: actor.id,
            createdByName: actor.name,
            createdAt: stamp,
            startedByName: actor.name,
            startedById: actor.id,
            sessionStartedAt: stamp,
            sessionId: "s-" + newId,
            sessionState: "closed",
            closedReason: "not_started",
            closedAt: stamp,
            lastInboundAt: null,
            waitingSince: null,
            firstResponseAt: null,
            firstResponseDelayMs: null,
            queueState: "Concluído",
            preview: "Cliente cadastrado. Inicie o atendimento.",
            last: "Agora",
          };
          n.contacts.push(c);
          audit(n, "Administrativo", "cliente_criado", "Cliente cadastrado", c);
        }
        return { contact: c, duplicate: false };
      });
    },
    favorite(id) {
      return commit((n) => {
        const c = allowed(n, id);
        c.favorite = !c.favorite;
      });
    },
    saveProfile(member) {
      return commit((n) => {
        admin(n);
        if (!Crm.canChangeRole(n.team, member.id, member.role))
          throw new Error("Mantenha pelo menos um administrador.");
        if (!member.name.trim() || !member.allowedSectors.length)
          throw new Error("Informe o nome e pelo menos um setor.");
        const existing = n.team.find((a) => a.id === member.id);
        if (existing) Object.assign(existing, member);
        else n.team.push(member);
        audit(
          n,
          "Administrativo",
          "perfil_configurado",
          `Perfil configurado: ${member.name}`,
          null,
          { papel: member.role, setores: member.allowedSectors },
        );
      });
    },
    saveTemplate(kind, template) {
      return commit((n) => {
        if (!Crm.capability(actorOf(n), "editTemplates"))
          throw new Error("Seu perfil não pode editar templates.");
        const list = kind === "quick" ? n.quickReplies : n.waTemplates,
          name = kind === "quick" ? template.shortcut : template.name;
        if (
          !(kind === "quick" ? /^[\p{Ll}\p{N}_]+$/u : /^[a-z0-9_]+$/).test(
            name || "",
          )
        )
          throw new Error(
            "Use letras minúsculas, números e sublinhado no atalho.",
          );
        if (
          list.some(
            (t) =>
              !t.archived &&
              t.id !== template.id &&
              (kind === "quick" ? t.shortcut : t.name) === name,
          )
        )
          throw new Error("Esse atalho ou nome já está em uso.");
        const existing = list.find((t) => t.id === template.id),
          updated = {
            ...template,
            kind,
            ...(kind === "whatsapp" ? { status: "draft" } : {}),
          };
        if (existing) Object.assign(existing, updated);
        else list.push(updated);
        audit(
          n,
          "Administrativo",
          "template_atualizado",
          "Template personalizado atualizado",
        );
      });
    },
    archiveTemplate(kind, id) {
      return commit((n) => {
        if (!Crm.capability(actorOf(n), "editTemplates"))
          throw new Error("Perfil sem permissão.");
        const t = (kind === "quick" ? n.quickReplies : n.waTemplates).find(
          (t) => t.id === id,
        );
        if (t) t.archived = true;
        audit(n, "Administrativo", "template_arquivado", "Template arquivado");
      });
    },
    addReminder(reminder) {
      return commit((n) => {
        allowed(n, reminder.contactId);
        if (!reminder.text.trim() || !Number.isFinite(Date.parse(reminder.at)))
          throw new Error("Preencha o lembrete e o prazo.");
        n.reminders.push({ ...reminder, id: uid(), done: false });
        audit(n, "Administrativo", "lembrete_criado", "Lembrete criado");
      });
    },
    toggleReminder(id) {
      return commit((n) => {
        const r = n.reminders.find((r) => r.id === id);
        if (!r) return;
        allowed(n, r.contactId);
        r.done = !r.done;
      });
    },
    settings(data) {
      return commit((n) => {
        admin(n);
        Object.assign(n.profile, data);
        actorOf(n).name = data.name;
        audit(
          n,
          "Administrativo",
          "perfil_empresa",
          "Perfil da empresa atualizado",
        );
      });
    },
    addSector(name) {
      return commit((n) => {
        admin(n);
        const value = name.trim();
        if (
          !value ||
          n.sectors.some((s) => s.toLowerCase() === value.toLowerCase())
        )
          throw new Error("Informe um setor novo.");
        n.sectors.push(value);
        audit(n, "Administrativo", "setor_criado", "Setor criado: " + value);
      });
    },
    logExport(kind) {
      return commit((n) => {
        if (kind === "clientes" && !Crm.capability(actorOf(n), "exportClients"))
          throw new Error("Perfil sem permissão.");
        if (kind === "logs" && !Crm.capability(actorOf(n), "viewLogs"))
          throw new Error("Perfil sem permissão.");
        audit(
          n,
          "Administrativo",
          kind + "_exportados",
          kind === "logs"
            ? "Eventos importantes exportados"
            : "Clientes visíveis exportados",
        );
      });
    },
  };
  persist(state);
  actions.expire();
  return {
    getSnapshot: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    actions,
  };
}
