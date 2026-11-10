import { useState } from "react";
import Modal, { ModalClose } from "../Modal.jsx";
import { useCrm, useUi } from "../../context.jsx";
import Crm from "../../domain/crm.mjs";
import Service from "../../domain/service.mjs";
import { duration, remaining } from "../../services/format.mjs";
const Field = ({ label, children }) => (
  <label className="react-field">
    <span>{label}</span>
    {children}
  </label>
);
export default function DialogRouter() {
  const { state, actions, actor, visible } = useCrm(),
    ui = useUi(),
    d = ui.dialog;
  if (!d) return null;
  const c = visible.find((c) => c.id === d.contactId);
  if (d.contactId && !c) return null;
  const restricted = ["profile", "sector"].includes(d.type)
    ? !Crm.isAdmin(actor)
    : d.type === "template"
      ? !Crm.capability(actor, "editTemplates")
      : false;
  if (restricted) return null;
  return (
    <Dialog
      key={`${d.type}-${d.contactId || d.id || "new"}-${actor.id}`}
      d={d}
      c={c}
      state={state}
      actions={actions}
      actor={actor}
      visible={visible}
      ui={ui}
    />
  );
}
function Dialog({ d, c, state, actions, actor, visible, ui }) {
  const kind = d.kind || "quick",
    source =
      d.type === "template"
        ? (kind === "quick" ? state.quickReplies : state.waTemplates).find(
            (t) => t.id === d.id,
          )
        : d.type === "profile"
          ? state.team.find((a) => a.id === d.id)
          : null;
  const initial =
    d.type === "contact"
      ? {
          name: c?.name || "",
          phone: c?.phone || "",
          company: c?.company || "",
          email: c?.email || "",
          sector: c?.sector || Crm.allowedSectors(actor, state.sectors)[0],
          tag: c?.tag || "Cliente",
        }
      : d.type === "profile"
        ? structuredClone(
            source || {
              id: crypto.randomUUID(),
              name: "",
              role: "Atendente",
              allowedSectors: [],
              capabilities: {},
            },
          )
        : d.type === "template"
          ? structuredClone(
              source || {
                id: crypto.randomUUID(),
                title: "",
                shortcut: "",
                name: "",
                body: "",
                values: {},
                category: "Utilidade",
                language: "pt_BR",
              },
            )
          : d.type === "transfer"
            ? { sector: c.sector, person: c.assigneeId || "", note: "" }
            : d.type === "reminder"
              ? { contactId: c?.id || visible[0]?.id, text: "", at: "" }
              : d.type === "whatsapp"
                ? {
                    id: state.waTemplates.find((t) => !t.archived)?.id || "",
                    values: {},
                    consent: false,
                  }
                : { text: d.type === "note" ? c.note || "" : "" };
  const [baseline] = useState(initial);
  const [form, setForm] = useState(baseline),
    [error, setError] = useState("");
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const close = () => ui.setDialog(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const run = (fn) => {
    try {
      fn();
      close();
    } catch (e) {
      setError(e.message);
    }
  };
  const title = {
    contact: c ? "Editar cliente" : "Novo cliente",
    profile: source ? "Configurar perfil" : "Novo colaborador",
    template: "Personalizar template",
    note: "Anotações do cliente",
    transfer: "Transferir atendimento",
    details: "Detalhes do atendimento",
    reminder: "Criar lembrete",
    whatsapp: "Modelo WhatsApp",
    incoming: "Simular mensagem do cliente",
    sector: "Adicionar setor",
  }[d.type];
  const input = (key, label, type = "text") => (
    <Field label={label}>
      <input
        required={["name", "phone", "title", "text"].includes(key)}
        type={type}
        value={form[key] || ""}
        onChange={(e) => update(key, e.target.value)}
      />
    </Field>
  );
  const sectorSelect = (
    <Field label="Setor">
      <select
        value={form.sector}
        onChange={(e) =>
          setForm((f) => ({ ...f, sector: e.target.value, person: "" }))
        }
      >
        {(d.type === "contact"
          ? Crm.allowedSectors(actor, state.sectors)
          : state.sectors
        ).map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </Field>
  );
  const duplicate =
    d.type === "contact"
      ? Crm.duplicate(state.contacts, form.phone, c?.id)
      : null;
  const template = state.waTemplates.find((t) => t.id === form.id);
  const vars =
    d.type === "template"
      ? Service.variables(form.body)
      : d.type === "whatsapp"
        ? Service.variables(template?.body || "")
        : [];
  const auto = {
    nome: c?.name || "Nome do cliente",
    atendente: actor.name,
    empresa: state.profile.company,
  };
  const submit = (e) => {
    e.preventDefault();
    run(() => {
      switch (d.type) {
        case "contact": {
          const result = actions.saveContact(form, c?.id);
          ui.openConversation(result.contact.id);
          ui.notify(
            result.duplicate
              ? "Cliente já cadastrado. Conversa aberta."
              : "Cliente salvo.",
          );
          break;
        }
        case "note":
          actions.saveNote(c.id, form.text);
          break;
        case "transfer":
          actions.transfer(c.id, form.sector, form.person, form.note);
          ui.notify("Atendimento transferido.");
          break;
        case "profile":
          actions.saveProfile({ ...form, sector: form.allowedSectors[0] });
          break;
        case "template":
          actions.saveTemplate(kind, form);
          break;
        case "reminder":
          actions.addReminder({ ...form, at: new Date(form.at).toISOString() });
          break;
        case "whatsapp":
          actions.sendTemplate(c.id, form.id, form.values, form.consent);
          ui.notify("Modelo simulado. Nenhuma mensagem real foi enviada.");
          break;
        case "incoming":
          actions.receive(c.id, form.text);
          break;
        case "sector":
          actions.addSector(form.text);
          break;
        default:
          break;
      }
    });
  };
  return (
    <Modal title={title} onClose={close} dirty={dirty && d.type !== "details"}>
      <form className="react-form" onSubmit={submit}>
        {d.type === "contact" && (
          <>
            {input("name", "Nome completo")}
            {input("phone", "Telefone com DDD", "tel")}
            {duplicate && (
              <div className="library-info">
                {Crm.canViewContact(actor, duplicate) ? (
                  <>
                    <b>{duplicate.name} já está cadastrado.</b>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => ui.openConversation(duplicate.id)}
                    >
                      Abrir conversa existente
                    </button>
                  </>
                ) : (
                  "Telefone já cadastrado em outro setor. Solicite acesso ao administrador."
                )}
              </div>
            )}
            {input("company", "Empresa")}
            {input("email", "E-mail", "email")}
            {sectorSelect}
            <Field label="Categoria">
              <select
                value={form.tag}
                onChange={(e) => update("tag", e.target.value)}
              >
                {["Cliente", "Lead", "VIP"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <small>Um novo contato fica sob sua responsabilidade.</small>
          </>
        )}
        {d.type === "note" && (
          <>
            <p>
              {c.name} · Nota interna, visível à equipe com acesso ao cliente.
            </p>
            <textarea
              aria-label="Anotação"
              rows={8}
              value={form.text}
              onChange={(e) => update("text", e.target.value)}
            />
          </>
        )}
        {d.type === "transfer" && (
          <>
            <p>Escolha o setor e, se quiser, a pessoa responsável.</p>
            {sectorSelect}
            <Field label="Responsável">
              <select
                value={form.person}
                onChange={(e) => update("person", e.target.value)}
              >
                <option value="">Fila do setor · sem responsável</option>
                {state.team
                  .filter((a) => Crm.canViewSector(a, form.sector))
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
            {input("note", "Observação da transferência")}
          </>
        )}
        {d.type === "profile" && (
          <>
            {input("name", "Nome completo")}
            <Field label="Perfil">
              <select
                value={form.role}
                onChange={(e) => update("role", e.target.value)}
              >
                <option>Atendente</option>
                <option>Administrador</option>
              </select>
            </Field>
            <fieldset>
              <legend>Setores que pode visualizar</legend>
              {state.sectors.map((s) => (
                <label className="react-check" key={s}>
                  <input
                    type="checkbox"
                    checked={form.allowedSectors.includes(s)}
                    onChange={(e) =>
                      update(
                        "allowedSectors",
                        e.target.checked
                          ? [...form.allowedSectors, s]
                          : form.allowedSectors.filter((x) => x !== s),
                      )
                    }
                  />
                  {s}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Permissões adicionais</legend>
              {[
                ["editTemplates", "Editar templates"],
                ["viewLogs", "Visualizar logs"],
                ["exportClients", "Exportar clientes"],
              ].map(([key, label]) => (
                <label className="react-check" key={key}>
                  <input
                    type="checkbox"
                    checked={
                      form.role === "Administrador" ||
                      !!form.capabilities?.[key]
                    }
                    disabled={form.role === "Administrador"}
                    onChange={(e) =>
                      update("capabilities", {
                        ...form.capabilities,
                        [key]: e.target.checked,
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </>
        )}
        {d.type === "template" && (
          <>
            {input("title", "Título")}
            {input(
              kind === "quick" ? "shortcut" : "name",
              kind === "quick" ? "Atalho (sem barra)" : "Nome do modelo",
            )}
            <Field label="Texto">
              <textarea
                required
                rows={6}
                value={form.body}
                onChange={(e) => update("body", e.target.value)}
              />
            </Field>
            <small>
              Campos automáticos: {"{{nome}}, {{atendente}}, {{empresa}}"}. Crie
              outros campos com chaves duplas.
            </small>
            {vars
              .filter((v) => !Object.hasOwn(auto, v))
              .map((v) => (
                <Field key={v} label={`Valor personalizado · ${v}`}>
                  <input
                    value={form.values?.[v] || ""}
                    onChange={(e) =>
                      update("values", { ...form.values, [v]: e.target.value })
                    }
                  />
                </Field>
              ))}
            <div className="template-preview">
              {Service.compile(form.body, { ...auto, ...form.values }).text}
            </div>
            {source && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  run(() => actions.archiveTemplate(kind, source.id))
                }
              >
                Arquivar template
              </button>
            )}
          </>
        )}
        {d.type === "whatsapp" && (
          <>
            <p>
              Prévia local: exige modelo aprovado pela Meta e autorização do
              cliente para envio real.
            </p>
            <Field label="Modelo">
              <select
                value={form.id}
                onChange={(e) =>
                  setForm({ ...form, id: e.target.value, values: {} })
                }
              >
                {state.waTemplates
                  .filter((t) => !t.archived)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </Field>
            {vars
              .filter((v) => !Object.hasOwn(auto, v))
              .map((v) => (
                <Field key={v} label={v}>
                  <input
                    value={form.values[v] ?? template?.values?.[v] ?? ""}
                    onChange={(e) =>
                      update("values", { ...form.values, [v]: e.target.value })
                    }
                  />
                </Field>
              ))}
            <div className="template-preview">
              {
                Service.compile(template?.body || "", {
                  ...template?.values,
                  ...auto,
                  ...form.values,
                }).text
              }
            </div>
            <label className="react-check">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => update("consent", e.target.checked)}
              />
              Cliente autorizou este contato
            </label>
          </>
        )}
        {d.type === "reminder" && (
          <>
            <Field label="Cliente">
              <select
                value={form.contactId}
                onChange={(e) => update("contactId", Number(e.target.value))}
              >
                {visible.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            {input("text", "Lembrete")}
            {input("at", "Data e horário", "datetime-local")}
          </>
        )}
        {["incoming", "sector"].includes(d.type) &&
          input(
            "text",
            d.type === "incoming" ? "Mensagem do cliente" : "Nome do setor",
          )}
        {d.type === "details" && (
          <dl className="react-details">
            <dt>Cliente</dt>
            <dd>{c.name}</dd>
            <dt>Quem iniciou</dt>
            <dd>{c.startedByName || "Não registrado"}</dd>
            <dt>Responsável</dt>
            <dd>
              {state.team.find((a) => a.id === c.assigneeId)?.name ||
                "Sem responsável"}
            </dd>
            <dt>Primeira resposta</dt>
            <dd>
              {c.firstResponseDelayMs == null
                ? "Aguardando"
                : duration(c.firstResponseDelayMs)}
            </dd>
            <dt>Tempo de espera atual</dt>
            <dd>
              {c.waitingSince && c.sessionState === "open"
                ? duration(Date.now() - Date.parse(c.waitingSince))
                : "Cliente respondido"}
            </dd>
            <dt>Janela do WhatsApp</dt>
            <dd>
              {c.sessionState === "closed"
                ? "Atendimento finalizado"
                : remaining(c, Date.now())}
            </dd>
            <dt>Setor</dt>
            <dd>{c.sector}</dd>
          </dl>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <ModalClose>
            {d.type === "details" ? "Fechar" : "Cancelar"}
          </ModalClose>
          {d.type !== "details" && (
            <button className="primary" type="submit" disabled={!!duplicate}>
              {d.type === "transfer"
                ? "Transferir"
                : d.type === "whatsapp"
                  ? "Simular envio"
                  : "Salvar"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
