import { useEffect, useState } from "react";
import { useCrm, useUi } from "../context.jsx";
import {
  templateSchema,
  templatePreview,
} from "../domain/whatsapp-template.mjs";
import Modal, { ModalClose } from "./Modal.jsx";
import { grantFor, templatePermissionError } from "../domain/communication.mjs";

export function useMetaTemplates() {
  const { store } = useCrm(),
    [templates, setTemplates] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const workspaceId = store.getCloudSnapshot().workspace.id;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    store
      .listMetaTemplates()
      .then((data) => {
        if (active) setTemplates(data.templates);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store, workspaceId, version]);
  return { templates, error, loading, reload: () => setVersion((v) => v + 1) };
}
export function MetaTemplateLibrary() {
  const { templates, error, loading, reload } = useMetaTemplates(),
    ui = useUi();
  return (
    <section className="meta-library">
      <div className="library-info">
        Modelos aprovados na sua conta da Meta. Para enviar, abra uma conversa e
        escolha “Enviar template”. A aprovação não remove restrições de entrega
        nem eventuais cobranças da Meta.
      </div>
      <button className="secondary" onClick={reload} disabled={loading}>
        {loading ? "Consultando Meta…" : "Atualizar modelos da Meta"}
      </button>
      {error && <p role="alert">{error}</p>}
      <div className="message-library-grid">
        {templates.map((t) => (
          <article className="surface library-card" key={t.id}>
            <header>
              <h2>{t.name}</h2>
              <span className="library-label">Aprovado · {t.language}</span>
            </header>
            <small>{t.category}</small>
            <p className="meta-template-text">{templatePreview(t)}</p>
            <p>
              {t.unsupported ||
                (templateSchema(t).fields.length
                  ? templateSchema(t).fields.length + " campos para preencher"
                  : "Pronto para enviar")}
            </p>
            <button
              className="secondary"
              onClick={() => ui.navigate("attendance")}
            >
              Escolher conversa
            </button>
          </article>
        ))}
      </div>
      {!loading && !error && !templates.length && (
        <p>Nenhum modelo aprovado encontrado nesta conta.</p>
      )}
    </section>
  );
}
export default function MetaTemplateDialog({ contact }) {
  const { store, state } = useCrm(),
    ui = useUi(),
    { templates, error: loadError, loading, reload } = useMetaTemplates();
  const [id, setId] = useState(""),
    [values, setValues] = useState({}),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const template =
    templates.find((t) => t.id === id) ||
    templates.find((t) => t.name === "hello_world" && !t.unsupported) ||
    templates.find((t) => !t.unsupported) ||
    templates[0];
  const schema = template ? templateSchema(template) : null;
  const permissionError = template
    ? templatePermissionError(state, contact, template.category)
    : "";
  const authorization = template
    ? grantFor(state, contact, template.category)
    : null;
  async function submit(e) {
    e.preventDefault();
    if (!template || busy || permissionError) return;
    setBusy(true);
    setError("");
    try {
      await store.actions.sendTemplate(
        contact.id,
        template.id,
        values,
        consent,
      );
      ui.notify("Modelo aceito pela Meta. Aguardando confirmação de entrega.");
      ui.setDialog(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Enviar template do WhatsApp"
      onClose={() => {
        if (!busy) ui.setDialog(null);
      }}
    >
      <form className="meta-template-form" onSubmit={submit}>
        <p>
          Para <b>{contact.name}</b> · {contact.phone}
        </p>
        <p className="library-info">
          A Meta pode cobrar por este envio e aplicar restrições da conta. Um
          template não reabre a janela de 24 horas: o cliente precisa responder.
        </p>
        {loading && <p role="status">Consultando modelos aprovados…</p>}
        {loadError && <p role="alert">{loadError}</p>}
        <button
          className="secondary"
          type="button"
          onClick={reload}
          disabled={loading || busy}
        >
          Atualizar modelos
        </button>
        {!!templates.length && (
          <>
            <label className="react-field">
              <span>Modelo aprovado</span>
              <select
                value={template?.id || ""}
                disabled={busy}
                onChange={(e) => {
                  setId(e.target.value);
                  setValues({});
                  setConsent(false);
                  setError("");
                }}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.language} · {t.category}
                  </option>
                ))}
              </select>
            </label>
            {schema?.unsupported && <p role="alert">{schema.unsupported}</p>}
            {schema?.fields.map((f) => (
              <label className="react-field" key={f.key}>
                <span>{f.label}</span>
                <input
                  type={f.kind === "url" ? "url" : "text"}
                  placeholder={f.kind === "url" ? "https://…" : ""}
                  required
                  maxLength={2000}
                  disabled={busy}
                  value={values[f.key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              </label>
            ))}
            {schema?.fields.some((f) => f.kind === "url") && (
              <small>
                Use URLs HTTPS públicas. A Meta buscará os arquivos para enviar
                o modelo.
              </small>
            )}
            <h3>Prévia</h3>
            <div className="template-preview meta-template-text">
              {templatePreview(template, values)}
            </div>
            <label className="react-check">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Este envio corresponde à finalidade autorizada abaixo
            </label>
            {authorization && (
              <p className="library-info">
                Finalidade autorizada: {authorization.purpose}
              </p>
            )}
            {permissionError && (
              <p role="status" className="communication-warning">
                {permissionError}
              </p>
            )}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                ui.setDialog({ type: "communication", contactId: contact.id })
              }
            >
              Gerenciar preferências de contato
            </button>
          </>
        )}
        {!loading && !loadError && !templates.length && (
          <p>Nenhum modelo aprovado disponível.</p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <ModalClose>Cancelar</ModalClose>
          <button
            className="primary"
            type="submit"
            disabled={
              busy ||
              loading ||
              !!loadError ||
              !template ||
              !!schema?.unsupported ||
              !consent ||
              !!permissionError
            }
          >
            {busy ? "Enviando…" : "Enviar template"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
