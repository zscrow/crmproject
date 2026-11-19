export async function workspaceApi(path = "", body) {
  const response = await fetch("/api/workspace" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.error || "Não foi possível acessar os dados da empresa.",
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
export function createCloudStore(initial) {
  let state = initial.state,
    revision = initial.revision,
    queue = Promise.resolve(),
    pending = 0,
    disposed = false;
  let viewQueue = Promise.resolve();
  let cloud = {
    status: "saved",
    workspace: initial.workspace,
    workspaces: initial.workspaces,
    inbox: initial.inbox,
    error: "",
  };
  const listeners = new Set();
  const emit = () => {
    if (!disposed) listeners.forEach((fn) => fn());
  };
  const update = (data) => {
    if (!data.state) return;
    if (data.workspace?.id === cloud.workspace.id && data.revision < revision)
      return;
    state = {
      ...data.state,
      theme: state.theme,
      serviceSort: state.serviceSort,
    };
    revision = data.revision;
    cloud = {
      ...cloud,
      workspace: data.workspace,
      workspaces: data.workspaces,
      inbox: data.inbox,
    };
  };
  const action =
    (name) =>
    (...args) => {
      pending++;
      cloud = { ...cloud, status: "saving", error: "" };
      emit();
      const run = async () => {
        const body = {
          action: name,
          args,
          revision,
          workspaceId: cloud.workspace.id,
          operationId: crypto.randomUUID(),
        };
        try {
          const data = await workspaceApi("/actions", body);
          update(data);
          cloud = { ...cloud, error: "" };
          return data.result;
        } catch (error) {
          if (error.data?.state) update(error.data);
          cloud = { ...cloud, error: error.message };
          throw error;
        } finally {
          pending--;
          cloud = {
            ...cloud,
            status: pending ? "saving" : cloud.error ? "error" : "saved",
          };
          emit();
        }
      };
      const result = queue.then(run);
      queue = result.catch(() => {});
      return result;
    };
  const actions = Object.fromEntries(
    [
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
      "recordCommunication",
    ].map((name) => [name, action(name)]),
  );
  actions.expire = () => 0;
  actions.setAgent = () => {
    throw new Error("O atendente é definido pelo login.");
  };
  for (const name of ["receive", "saveProfile"])
    actions[name] = async () => {
      throw new Error(
        "Esta ação depende da próxima etapa da integração. Use a gestão de equipe para alterar acessos.",
      );
    };
  const attempts = new Map();
  actions.send = async (
    contactId,
    text,
    attachments = [],
    expectedAgent,
    replyId = null,
  ) => {
    if (attachments.length)
      throw new Error("O envio conectado aceita texto nesta etapa.");
    const workspaceId = cloud.workspace.id;
    const key = JSON.stringify([workspaceId, contactId, text, replyId]);
    const operationId = attempts.get(key) || crypto.randomUUID();
    attempts.set(key, operationId);
    pending++;
    emit();
    try {
      const data = await workspaceApi("/send", {
        workspaceId,
        contactId,
        text,
        replyId,
        operationId,
      });
      update(data);
      attempts.delete(key);
      emit();
      return data.result;
    } catch (error) {
      if (error.data?.state) update(error.data);
      if (
        (error.status && error.status !== 409 && error.status < 500) ||
        error.data?.result?.status === 502
      )
        attempts.delete(key);
      emit();
      throw error;
    } finally {
      pending--;
      emit();
    }
  };
  actions.sendTemplate = async (
    contactId,
    templateId,
    values = {},
    consent = false,
  ) => {
    const workspaceId = cloud.workspace.id;
    const key = JSON.stringify([
      "template",
      workspaceId,
      contactId,
      templateId,
      values,
      consent,
    ]);
    const operationId = attempts.get(key) || crypto.randomUUID();
    attempts.set(key, operationId);
    pending++;
    emit();
    try {
      const data = await workspaceApi("/send", {
        workspaceId,
        operationId,
        contactId,
        type: "template",
        templateId,
        values,
        consent,
      });
      if (cloud.workspace.id === workspaceId) update(data);
      attempts.delete(key);
      emit();
      return data.result;
    } catch (error) {
      if (error.data?.state && cloud.workspace.id === workspaceId)
        update(error.data);
      if (
        (error.status && error.status !== 409 && error.status < 500) ||
        error.data?.result?.status === 502
      )
        attempts.delete(key);
      emit();
      throw error;
    } finally {
      pending--;
      emit();
    }
  };
  for (const [name, key] of [
    ["setTheme", "theme"],
    ["setSort", "serviceSort"],
  ])
    actions[name] = (value) => {
      state = { ...state, [key]: value };
      emit();
    };
  async function refresh() {
    if (pending || disposed) return;
    try {
      const data = await workspaceApi();
      if (pending || disposed) return;
      update(data);
      cloud = { ...cloud, status: "saved", error: "" };
      emit();
    } catch (error) {
      cloud = { ...cloud, status: "error", error: error.message };
      emit();
    }
  }
  return {
    cloud: true,
    getSnapshot: () => state,
    getCloudSnapshot: () => cloud,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    actions,
    listMetaTemplates: () => workspaceApi("/templates"),
    setViewed(contactId, messageIds, read = true) {
      const workspaceId = cloud.workspace.id;
      const run = async () => {
        for (let start = 0; start < messageIds.length; start += 200) {
          const data = await workspaceApi("/viewed", {
            workspaceId,
            contactId,
            messageIds: messageIds.slice(start, start + 200),
            read,
          });
          update(data);
          emit();
        }
      };
      const result = viewQueue.then(run);
      viewQueue = result.catch(() => {});
      return result;
    },
    refresh,
    dispose: () => {
      disposed = true;
      listeners.clear();
    },
    async invite(body) {
      return workspaceApi("/invitations", {
        ...body,
        workspaceId: cloud.workspace.id,
      });
    },
    async member(body) {
      const data = await workspaceApi("/member", {
        ...body,
        workspaceId: cloud.workspace.id,
      });
      update(data);
      emit();
    },
    async removeMember(userId) {
      const data = await workspaceApi("/remove-member", {
        userId,
        workspaceId: cloud.workspace.id,
      });
      update(data);
      emit();
    },
    async switchWorkspace(workspaceId) {
      if (pending) throw new Error("Aguarde a alteração em andamento.");
      await workspaceApi("/switch", { workspaceId });
      location.reload();
    },
    async importLocal(snapshot) {
      const data = await workspaceApi("/import", {
        snapshot,
        revision,
        workspaceId: cloud.workspace.id,
        operationId: crypto.randomUUID(),
      });
      update(data);
      emit();
    },
  };
}
