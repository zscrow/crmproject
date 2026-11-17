const el = (id) => document.getElementById(id);
const feedback = (text) => {
  el("feedback").textContent = text;
};
async function api(path, body) {
  const response = await fetch("/api/whatsapp/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) logout();
    throw new Error(data.error + (data.code ? ` (Meta: ${data.code})` : ""));
  }
  return data;
}
function logout() {
  el("events").replaceChildren();
  el("panel").hidden = true;
  el("login").hidden = false;
}
async function refresh() {
  el("refresh").disabled = true;
  try {
    const { events } = await api("events");
    el("events").replaceChildren();
    if (!events.length)
      el("events").textContent =
        "Nenhum evento recebido para o número configurado.";
    for (const event of events) {
      const article = document.createElement("article"),
        heading = document.createElement("strong"),
        text = document.createElement("p"),
        meta = document.createElement("small");
      heading.textContent =
        (event.kind === "status" ? "Status de entrega" : "Mensagem recebida") +
        (event.phone ? " · " + event.phone : "");
      const labels = {
        sent: "Enviada",
        delivered: "Entregue",
        read: "Lida",
        failed: "Falha na entrega",
      };
      text.textContent =
        event.kind === "status" ? labels[event.text] || event.text : event.text;
      for (const code of event.errorCodes || []) {
        text.textContent +=
          code === 130497
            ? " — Meta 130497: esta conta está restrita de enviar mensagens ao país do destinatário. Confira as restrições da conta no WhatsApp Manager."
            : ` — Erro da Meta: ${code}`;
      }
      meta.textContent =
        new Date(event.receivedAt).toLocaleString("pt-BR") + " · " + event.id;
      article.append(heading, text, meta);
      el("events").append(article);
    }
  } finally {
    el("refresh").disabled = false;
  }
}
async function connect() {
  try {
    const status = await api("status");
    el("connection").textContent = status.sendingConfigured
      ? `Envio configurado para ${status.recipient}. A Meta ainda validará as permissões a cada envio.`
      : "Banco conectado. Faltam credenciais de envio ou destinatário de teste no servidor.";
    el("send-text").disabled = el("hello").disabled = !status.sendingConfigured;
    el("login").hidden = true;
    el("panel").hidden = false;
    await refresh();
    feedback("Conexão com o banco confirmada.");
  } catch (error) {
    feedback(error.message);
  }
}
connect();
el("logout").onclick = async () => {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (response.ok) {
    logout();
    location.href = "/";
  } else feedback("Não foi possível sair. Tente novamente.");
};
el("refresh").onclick = () =>
  refresh()
    .then(() => feedback("Eventos atualizados."))
    .catch((error) => feedback(error.message));
async function send(type) {
  el("send-text").disabled = el("hello").disabled = true;
  try {
    const result = await api("send", { type, text: el("text").value });
    feedback(
      "Mensagem aceita pela Meta. Isso ainda não confirma a entrega. ID: " +
        result.id,
    );
    if (type === "text") el("text").value = "";
  } catch (error) {
    feedback(error.message);
  } finally {
    el("send-text").disabled = el("hello").disabled = false;
  }
}
el("send").onsubmit = (e) => {
  e.preventDefault();
  send("text");
};
el("hello").onclick = () => send("template");
