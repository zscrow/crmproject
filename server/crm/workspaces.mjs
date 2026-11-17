import { createCrmStore, initialState } from "../../src/store.mjs";
import Crm from "../../src/domain/crm.mjs";
import { digest, randomToken } from "./auth.mjs";
import { syncInbound } from "./inbound.mjs";
const memory = { getItem: () => null, setItem: () => {} };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
export function emptyWorkspace(user) {
  const state = initialState(memory);
  Object.assign(state, {
    contacts: [],
    messages: {},
    audit: [],
    reminders: [],
    waTemplates: [],
    team: [],
    activeAgentId: user.id,
    profile: { name: user.name, email: user.email, company: user.company },
  });
  return state;
}
export async function workspaceFor(db, user) {
  const memberships = await db
    .prepare(
      "SELECT m.*,w.name FROM klivo_memberships m JOIN klivo_workspaces w ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY m.joined_at, m.workspace_id",
    )
    .bind(user.id)
    .all();
  if (!memberships.results.length) {
    const id = user.active_workspace_id
        ? crypto.randomUUID()
        : "workspace-" + user.id,
      now = Date.now();
    await db.batch([
      db
        .prepare(
          "INSERT OR IGNORE INTO klivo_workspaces (id,name,created_at,state_json) VALUES (?,?,?,?)",
        )
        .bind(id, user.company, now, JSON.stringify(emptyWorkspace(user))),
      db
        .prepare(
          "INSERT OR IGNORE INTO klivo_memberships (workspace_id,user_id,role,joined_at) VALUES (?,?,'admin',?)",
        )
        .bind(id, user.id, now),
      db
        .prepare("UPDATE klivo_users SET active_workspace_id=? WHERE id=?")
        .bind(id, user.id),
    ]);
    return workspaceFor(db, { ...user, active_workspace_id: id });
  }
  const member =
    memberships.results.find(
      (m) => m.workspace_id === user.active_workspace_id,
    ) || memberships.results[0];
  const inbox = await syncInbound(db, member.workspace_id);
  const workspace = await db
    .prepare("SELECT * FROM klivo_workspaces WHERE id=?")
    .bind(member.workspace_id)
    .first();
  const rows = await db
    .prepare(
      "SELECT m.*,u.name,u.email FROM klivo_memberships m JOIN klivo_users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.joined_at,m.user_id",
    )
    .bind(workspace.id)
    .all();
  const state = JSON.parse(workspace.state_json);
  state.team = rows.results.map((row) => ({
    id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role === "admin" ? "Administrador" : "Atendente",
    allowedSectors:
      row.role === "admin" ? [...state.sectors] : JSON.parse(row.sectors_json),
    sector: JSON.parse(row.sectors_json)[0] || state.sectors[0],
    capabilities: JSON.parse(row.capabilities_json),
  }));
  state.activeAgentId = user.id;
  const views = (
    await db
      .prepare(
        "SELECT contact_id,message_id,viewed_at FROM klivo_message_views WHERE workspace_id=? AND user_id=?",
      )
      .bind(workspace.id, user.id)
      .all()
  ).results;
  return {
    workspace,
    member,
    state,
    inbox,
    views,
    memberships: memberships.results,
  };
}
export function visibleState(state, userId) {
  const actor = state.team.find((p) => p.id === userId),
    copy = structuredClone(state);
  if (!Crm.isAdmin(actor)) {
    copy.contacts = state.contacts.filter((c) => Crm.canViewContact(actor, c));
    const ids = new Set(copy.contacts.map((c) => String(c.id)));
    copy.messages = Object.fromEntries(
      Object.entries(state.messages).filter(([id]) => ids.has(id)),
    );
    copy.reminders = state.reminders.filter((r) =>
      ids.has(String(r.contactId)),
    );
    copy.audit = Crm.capability(actor, "viewLogs")
      ? state.audit.filter(
          (e) => e.actorId === userId || ids.has(String(e.contactId)),
        )
      : [];
  }
  return copy;
}
function responseState(c, user, result, extra = {}) {
  const state = visibleState(c.state, user.id);
  const viewed = new Map(
    (c.views || []).map((v) => [
      JSON.stringify([v.contact_id, v.message_id]),
      v.viewed_at,
    ]),
  );
  for (const contact of state.contacts) {
    let unread = 0;
    state.messages[contact.id] = (state.messages[contact.id] || []).map(
      (message) => {
        if (message.direction !== "inbound" || !message.id) return message;
        const viewedAt =
          viewed.get(JSON.stringify([String(contact.id), message.id])) || null;
        if (!viewedAt) unread++;
        return { ...message, viewedAt };
      },
    );
    contact.unreadCount = unread;
  }
  if (
    result?.contact &&
    !Crm.canViewContact(
      c.state.team.find((p) => p.id === user.id),
      result.contact,
    )
  )
    result = null;
  return {
    workspace: {
      id: c.workspace.id,
      name: c.workspace.name,
      role: c.member.role,
    },
    workspaces: c.memberships.map((m) => ({
      id: m.workspace_id,
      name: m.name,
      role: m.role,
    })),
    revision: c.workspace.revision,
    inbox: c.inbox,
    state,
    result,
    ...extra,
  };
}
const actions = new Set([
  "claim",
  "transfer",
  "close",
  "reopen",
  "saveNote",
  "saveContact",
  "favorite",
  "saveTemplate",
  "archiveTemplate",
  "addReminder",
  "toggleReminder",
  "settings",
  "addSector",
  "logExport",
]);
function argsFor(action, args, state, user) {
  if (!Array.isArray(args) || args.length > 6)
    throw new Error("Dados da alteração inválidos.");
  args = structuredClone(args);
  if (action === "saveContact") {
    const value = args[0];
    if (!value || typeof value !== "object")
      throw new Error("Contato inválido.");
    args[0] = Object.fromEntries(
      ["name", "phone", "company", "email", "sector", "tag"].map((k) => [
        k,
        String(value[k] || "").slice(0, 1000),
      ]),
    );
    if (!state.sectors.includes(args[0].sector))
      throw new Error("Escolha um setor da empresa.");
  }
  if (action === "settings") {
    const value = args[0];
    if (!value || typeof value !== "object")
      throw new Error("Perfil inválido.");
    args[0] = {
      name: user.name,
      email: String(value.email || "").slice(0, 254),
      company: String(value.company || "")
        .trim()
        .slice(0, 100),
    };
    if (args[0].company.length < 2)
      throw new Error("Informe o nome da empresa.");
  }
  if (action === "saveTemplate") {
    const template = args[1];
    if (!template || typeof template !== "object")
      throw new Error("Template inválido.");
    args[1] = Object.fromEntries(
      [
        "id",
        "title",
        "shortcut",
        "name",
        "body",
        "values",
        "category",
        "language",
      ]
        .filter((k) => k in template)
        .map((k) => [k, template[k]]),
    );
  }
  return args;
}
async function writeState(db, c, user, body, state, result) {
  const text = JSON.stringify(state);
  if (new TextEncoder().encode(text).byteLength > 900000)
    return json(
      {
        error:
          "A empresa atingiu o limite de dados desta versão. Contate o suporte.",
      },
      413,
    );
  const next = c.workspace.revision + 1;
  const out = await db.batch([
    db
      .prepare(
        "UPDATE klivo_workspaces SET state_json=?,name=?,revision=? WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM klivo_memberships WHERE workspace_id=? AND user_id=? AND role=? AND sectors_json=? AND capabilities_json=?)",
      )
      .bind(
        text,
        state.profile.company,
        next,
        c.workspace.id,
        c.workspace.revision,
        c.workspace.id,
        user.id,
        c.member.role,
        c.member.sectors_json,
        c.member.capabilities_json,
      ),
    db
      .prepare(
        "INSERT INTO klivo_operations (workspace_id,operation_id,user_id,result_json,created_at) SELECT ?,?,?,?,? WHERE changes()=1",
      )
      .bind(
        c.workspace.id,
        body.operationId,
        user.id,
        JSON.stringify(result ?? null),
        Date.now(),
      ),
  ]);
  if (!out[0].meta.changes)
    return json(
      responseState(await workspaceFor(db, user), user, null, {
        error:
          "Outra pessoa alterou os dados. Atualizamos sua tela; confira e tente novamente.",
      }),
      409,
    );
  c.state = state;
  c.workspace.revision = next;
  c.workspace.name = state.profile.company;
  return json(responseState(c, user, result));
}
async function bodyOf(request, max = 50000) {
  const text = await request.text();
  if (text.length > max) throw new Error("Solicitação muito grande.");
  return JSON.parse(text);
}
const profileSectors = (body, state) =>
  Array.isArray(body.sectors)
    ? [...new Set(body.sectors.filter((s) => state.sectors.includes(s)))]
    : [];
const capabilities = (body) =>
  Object.fromEntries(
    ["viewLogs", "editTemplates", "exportClients"].map((k) => [
      k,
      body.capabilities?.[k] === true,
    ]),
  );
function importedState(snapshot, c, user) {
  if (
    !snapshot ||
    !Array.isArray(snapshot.contacts) ||
    snapshot.contacts.length > 1000
  )
    throw new Error("Importação inválida: máximo de 1000 contatos.");
  const next = structuredClone(c.state),
    seen = new Set();
  next.sectors = [
    ...new Set([
      ...next.sectors,
      ...snapshot.contacts.map((p) =>
        String(p.sector || "Triagem").slice(0, 100),
      ),
    ]),
  ];
  for (const original of snapshot.contacts) {
    if (
      typeof original.name !== "string" ||
      !original.name.trim() ||
      Crm.phoneKey(original.phone).length < 8
    )
      throw new Error("Existem contatos sem nome ou telefone válido.");
    const id = original.id;
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      seen.has(String(id)) ||
      ["__proto__", "constructor", "prototype"].includes(String(id))
    )
      throw new Error("Identificador de contato inválido ou duplicado.");
    seen.add(String(id));
    const contact = Object.fromEntries(
      ["name", "phone", "company", "email", "tag", "note", "preview"].map(
        (key) => [
          key,
          String(original[key] || "").slice(0, key === "note" ? 10000 : 1000),
        ],
      ),
    );
    Object.assign(contact, {
      id,
      sector: String(original.sector || "Triagem").slice(0, 100),
      color: "blue",
      initials: original.name
        .trim()
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join(""),
      assigneeId: user.id,
      createdById: user.id,
      createdByName: user.name,
      sessionId: "import-" + id,
      sessionState: "closed",
      closedReason: "imported",
      lastInboundAt: null,
      createdAt: new Date().toISOString(),
      favorite: original.favorite === true,
    });
    next.contacts.push(contact);
    const messages = Array.isArray(snapshot.messages?.[id])
      ? snapshot.messages[id]
      : [];
    if (messages.length > 2000)
      throw new Error("Importe no máximo 2000 mensagens por contato.");
    next.messages[id] = messages.map((item) => {
      const message = typeof item === "string" ? { text: item } : item;
      return {
        id: crypto.randomUUID(),
        direction: ["inbound", "outbound", "system"].includes(message.direction)
          ? message.direction
          : "system",
        text:
          String(message.text || "").slice(0, 10000) +
          (message.attachments?.length
            ? " [Anexos mantidos no navegador de origem]"
            : ""),
        createdAt: Number.isFinite(Date.parse(message.createdAt))
          ? message.createdAt
          : null,
        senderName: String(message.senderName || original.name).slice(0, 100),
        source: "imported",
        sessionId: contact.sessionId,
      };
    });
  }
  next.audit.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actorId: user.id,
    actorName: user.name,
    category: "Administrativo",
    action: "dados_importados",
    description: "Contatos e histórico de texto importados do navegador.",
  });
  return next;
}
export async function workspaceRoute(request, env, user) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin)
    return json({ error: "Origem não permitida." }, 403);
  let c = await workspaceFor(env.DB, user);
  if (url.pathname === "/api/workspace" && request.method === "GET")
    return json(responseState(c, user));
  if (url.pathname === "/api/workspace/viewed" && request.method === "POST") {
    const body = await bodyOf(request);
    if (body.workspaceId !== c.workspace.id)
      return json({ error: "A empresa ativa mudou. Atualize a página." }, 409);
    const contact = c.state.contacts.find(
      (p) => String(p.id) === String(body.contactId),
    );
    const actor = c.state.team.find((p) => p.id === user.id);
    if (!contact || !Crm.canViewContact(actor, contact))
      return json({ error: "Conversa não permitida." }, 403);
    if (
      typeof body.read !== "boolean" ||
      !Array.isArray(body.messageIds) ||
      body.messageIds.length > 200
    )
      return json({ error: "Lista de mensagens inválida." }, 400);
    const existing = new Set(
      (c.state.messages[contact.id] || [])
        .filter((m) => m.direction === "inbound" && m.id)
        .map((m) => m.id),
    );
    const ids = [
      ...new Set(
        body.messageIds.filter(
          (id) =>
            typeof id === "string" && id.length <= 512 && existing.has(id),
        ),
      ),
    ];
    if (ids.length) {
      const allowed =
        "EXISTS (SELECT 1 FROM klivo_memberships WHERE workspace_id=? AND user_id=? AND role=? AND sectors_json=? AND capabilities_json=?)";
      const guard = [
        c.workspace.id,
        user.id,
        c.member.role,
        c.member.sectors_json,
        c.member.capabilities_json,
      ];
      if (body.read)
        await env.DB.prepare(
          "INSERT OR IGNORE INTO klivo_message_views (workspace_id,user_id,contact_id,message_id,viewed_at) SELECT ?,?,?,value,? FROM json_each(?) WHERE " +
            allowed,
        )
          .bind(
            c.workspace.id,
            user.id,
            String(contact.id),
            new Date().toISOString(),
            JSON.stringify(ids),
            ...guard,
          )
          .run();
      else
        await env.DB.prepare(
          "DELETE FROM klivo_message_views WHERE workspace_id=? AND user_id=? AND contact_id=? AND message_id IN (SELECT value FROM json_each(?)) AND " +
            allowed,
        )
          .bind(
            c.workspace.id,
            user.id,
            String(contact.id),
            JSON.stringify(ids),
            ...guard,
          )
          .run();
    }
    return json(responseState(await workspaceFor(env.DB, user), user));
  }
  if (url.pathname === "/api/workspace/import" && request.method === "POST") {
    if (c.member.role !== "admin")
      return json(
        { error: "Somente administradores podem importar dados." },
        403,
      );
    const body = await bodyOf(request, 1500000);
    if (
      body.workspaceId !== c.workspace.id ||
      body.revision !== c.workspace.revision ||
      c.state.contacts.length
    )
      return json(
        {
          error:
            "Importe apenas em uma empresa vazia e atualize a página antes de tentar novamente.",
        },
        409,
      );
    if (
      typeof body.operationId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(body.operationId)
    )
      return json({ error: "Operação inválida." }, 400);
    try {
      return await writeState(
        env.DB,
        c,
        user,
        body,
        importedState(body.snapshot, c, user),
        null,
      );
    } catch (error) {
      return json({ error: error.message }, 400);
    }
  }
  if (url.pathname === "/api/workspace/switch" && request.method === "POST") {
    const body = await bodyOf(request);
    if (!c.memberships.some((m) => m.workspace_id === body.workspaceId))
      return json({ error: "Empresa não permitida." }, 403);
    await env.DB.prepare(
      "UPDATE klivo_users SET active_workspace_id=? WHERE id=?",
    )
      .bind(body.workspaceId, user.id)
      .run();
    return json({ ok: true });
  }
  if (url.pathname === "/api/workspace/join" && request.method === "POST") {
    const body = await bodyOf(request);
    if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
      return json({ error: "Convite inválido." }, 400);
    const hash = await digest(body.token),
      invitation = await env.DB.prepare(
        "SELECT * FROM klivo_invitations WHERE token_hash=? AND expires_at>? AND accepted_by IS NULL",
      )
        .bind(hash, Date.now())
        .first();
    if (
      !invitation ||
      invitation.email.toLowerCase() !== user.email.toLowerCase()
    )
      return json(
        {
          error:
            "Convite expirado ou destinado a outro e-mail. Entre com a conta convidada.",
        },
        403,
      );
    if (
      await env.DB.prepare(
        "SELECT user_id FROM klivo_memberships WHERE workspace_id=? AND user_id=?",
      )
        .bind(invitation.workspace_id, user.id)
        .first()
    )
      return json({ error: "Você já faz parte dessa empresa." }, 409);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO klivo_memberships (workspace_id,user_id,role,sectors_json,joined_at) VALUES (?,?,?,?,?)",
      ).bind(
        invitation.workspace_id,
        user.id,
        invitation.role,
        invitation.sectors_json,
        Date.now(),
      ),
      env.DB.prepare(
        "UPDATE klivo_invitations SET accepted_by=? WHERE token_hash=?",
      ).bind(user.id, hash),
      env.DB.prepare(
        "UPDATE klivo_users SET active_workspace_id=? WHERE id=?",
      ).bind(invitation.workspace_id, user.id),
    ]);
    return json({ ok: true });
  }
  if (
    url.pathname === "/api/workspace/invitations" &&
    request.method === "POST"
  ) {
    if (c.member.role !== "admin")
      return json(
        { error: "Somente administradores podem convidar pessoas." },
        403,
      );
    const body = await bodyOf(request),
      email = String(body.email || "")
        .trim()
        .toLowerCase(),
      sectors = profileSectors(body, c.state);
    if (body.workspaceId !== c.workspace.id)
      return json({ error: "A empresa ativa mudou. Atualize a página." }, 409);
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !sectors.length ||
      !["admin", "agent"].includes(body.role)
    )
      return json(
        { error: "Informe e-mail, papel e pelo menos um setor válido." },
        400,
      );
    const token = randomToken();
    await env.DB.prepare(
      "INSERT INTO klivo_invitations (token_hash,workspace_id,email,role,sectors_json,created_by,expires_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM klivo_memberships WHERE workspace_id=? AND user_id=? AND role='admin')",
    )
      .bind(
        await digest(token),
        c.workspace.id,
        email,
        body.role,
        JSON.stringify(sectors),
        user.id,
        Date.now() + 7 * 86400000,
        c.workspace.id,
        user.id,
      )
      .run();
    return json({ url: url.origin + "/?invite=" + token });
  }
  if (url.pathname === "/api/workspace/member" && request.method === "POST") {
    if (c.member.role !== "admin")
      return json(
        { error: "Somente administradores podem alterar acessos." },
        403,
      );
    const body = await bodyOf(request),
      target = c.state.team.find((a) => a.id === body.userId),
      sectors = profileSectors(body, c.state);
    if (body.workspaceId !== c.workspace.id)
      return json({ error: "A empresa ativa mudou. Atualize a página." }, 409);
    if (!target || !["admin", "agent"].includes(body.role) || !sectors.length)
      return json({ error: "Perfil inválido." }, 400);
    if (target.role === "Administrador" && body.role === "agent") {
      const result = await env.DB.prepare(
        "UPDATE klivo_memberships SET role='agent',sectors_json=?,capabilities_json=? WHERE workspace_id=? AND user_id=? AND (SELECT COUNT(*) FROM klivo_memberships WHERE workspace_id=? AND role='admin')>1 AND EXISTS (SELECT 1 FROM klivo_memberships actor WHERE actor.workspace_id=? AND actor.user_id=? AND actor.role='admin')",
      )
        .bind(
          JSON.stringify(sectors),
          JSON.stringify(capabilities(body)),
          c.workspace.id,
          body.userId,
          c.workspace.id,
          c.workspace.id,
          user.id,
        )
        .run();
      if (!result.meta.changes)
        return json({ error: "Mantenha pelo menos um administrador." }, 409);
    } else
      await env.DB.prepare(
        "UPDATE klivo_memberships SET role=?,sectors_json=?,capabilities_json=? WHERE workspace_id=? AND user_id=? AND EXISTS (SELECT 1 FROM klivo_memberships actor WHERE actor.workspace_id=? AND actor.user_id=? AND actor.role='admin')",
      )
        .bind(
          body.role,
          JSON.stringify(sectors),
          JSON.stringify(capabilities(body)),
          c.workspace.id,
          body.userId,
          c.workspace.id,
          user.id,
        )
        .run();
    c = await workspaceFor(env.DB, user);
    return json(responseState(c, user));
  }
  if (
    url.pathname === "/api/workspace/remove-member" &&
    request.method === "POST"
  ) {
    if (c.member.role !== "admin")
      return json(
        { error: "Somente administradores podem remover acessos." },
        403,
      );
    const body = await bodyOf(request),
      target = c.state.team.find((p) => p.id === body.userId);
    if (body.workspaceId !== c.workspace.id || !target)
      return json({ error: "Pessoa ou empresa inválida." }, 400);
    const result = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM klivo_memberships WHERE workspace_id=? AND user_id=? AND (role!='admin' OR (SELECT COUNT(*) FROM klivo_memberships admins WHERE admins.workspace_id=? AND admins.role='admin')>1) AND EXISTS (SELECT 1 FROM klivo_memberships actor WHERE actor.workspace_id=? AND actor.user_id=? AND actor.role='admin')",
      ).bind(
        c.workspace.id,
        body.userId,
        c.workspace.id,
        c.workspace.id,
        user.id,
      ),
      env.DB.prepare(
        "UPDATE klivo_invitations SET expires_at=0 WHERE workspace_id=? AND email=? AND changes()=1",
      ).bind(c.workspace.id, target.email),
    ]);
    if (!result[0].meta.changes)
      return json(
        {
          error:
            "Não foi possível remover o acesso. Mantenha pelo menos um administrador.",
        },
        409,
      );
    return json(responseState(await workspaceFor(env.DB, user), user));
  }
  if (url.pathname === "/api/workspace/actions" && request.method === "POST") {
    const body = await bodyOf(request);
    if (body.workspaceId !== c.workspace.id)
      return json({ error: "A empresa ativa mudou. Atualize a página." }, 409);
    if (
      typeof body.operationId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(body.operationId)
    )
      return json({ error: "Identificador da alteração inválido." }, 400);
    const receipt = await env.DB.prepare(
      "SELECT user_id,result_json FROM klivo_operations WHERE workspace_id=? AND operation_id=?",
    )
      .bind(c.workspace.id, body.operationId)
      .first();
    if (receipt) {
      if (receipt.user_id !== user.id)
        return json({ error: "Operação inválida." }, 403);
      return json(responseState(c, user, JSON.parse(receipt.result_json)));
    }
    if (body.revision !== c.workspace.revision)
      return json(
        responseState(c, user, null, {
          error:
            "Os dados mudaram em outro acesso. Atualizamos sua tela; tente novamente.",
        }),
        409,
      );
    if (!actions.has(body.action))
      return json(
        { error: "Essa operação não está disponível nesta etapa." },
        403,
      );
    let result, state;
    try {
      const store = createCrmStore({ storage: memory, seed: c.state });
      result = store.actions[body.action](
        ...argsFor(body.action, body.args, c.state, user),
      );
      state = store.getSnapshot();
    } catch (error) {
      return json({ error: error.message || "Alteração não permitida." }, 400);
    }
    return writeState(env.DB, c, user, body, state, result);
  }
  return json({ error: "Rota não encontrada." }, 404);
}
