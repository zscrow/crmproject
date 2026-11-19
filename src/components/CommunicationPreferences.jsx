import { useState } from "react";
import { useCrm, useUi } from "../context.jsx";
import Crm from "../domain/crm.mjs";
import {
  SCOPES,
  SOURCES,
  preferencesFor,
  blockedFor,
  recipientKey,
} from "../domain/communication.mjs";
import Modal, { ModalClose } from "./Modal.jsx";

function localTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
}
export default function CommunicationPreferences({ contact }) {
  const { state, actions, actor, store } = useCrm(),
    ui = useUi();
  const canGrant = Crm.isAdmin(actor);
  const [action, setAction] = useState(canGrant ? "grant" : "revoke");
  const [scope, setScope] = useState(canGrant ? "UTILITY" : "ALL");
  const [source, setSource] = useState("whatsapp");
  const [occurredAt, setTime] = useState(localTime());
  const [purpose, setPurpose] = useState("");
  const [evidence, setEvidence] = useState("");
  const [resume, setResume] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const p = preferencesFor(state, contact);
  const history = (state.communicationHistory || [])
    .filter((e) => e.recipientKey === recipientKey(contact))
    .slice(-10)
    .reverse();
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await actions.recordCommunication(contact.id, {
        action,
        scope,
        source,
        occurredAt: new Date(occurredAt).toISOString(),
        purpose,
        evidence,
        resume,
      });
      ui.notify(
        action === "grant"
          ? "Autorização registrada. Nenhuma mensagem foi enviada."
          : "Pedido de interrupção registrado. Os envios serão bloqueados conforme a finalidade.",
      );
      ui.setDialog(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Preferências de contato"
      onClose={() => {
        if (!busy) ui.setDialog(null);
      }}
      dirty={!!(purpose || evidence)}
    >
      <p>
        <b>{contact.name}</b> · {contact.phone}
      </p>
      {!store.cloud && (
        <p className="library-info">
          Demonstração local. Nenhuma mensagem real é enviada.
        </p>
      )}
      <p>
        Registre apenas pedidos reais do cliente. Uma nova mensagem recebida não
        autoriza ofertas automaticamente.
      </p>
      {p.blockedAll && (
        <p role="status" className="communication-warning">
          Há um pedido de interrupção de todas as mensagens. Somente finalidades
          com nova autorização posterior podem ser retomadas.
        </p>
      )}
      <ul className="communication-status">
        {Object.entries(SCOPES).map(([key, label]) => (
          <li key={key}>
            {label}:{" "}
            {blockedFor(state, contact, key)
              ? "interrompido"
              : p.grants?.[key]
                ? "autorização registrada"
                : key === "SERVICE"
                  ? "depende do pedido do cliente e da janela de 24h"
                  : "sem autorização registrada"}
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="communication-form">
        <label className="react-field">
          <span>Tipo de registro</span>
          <select
            value={action}
            disabled={busy}
            onChange={(e) => {
              setAction(e.target.value);
              setScope(e.target.value === "revoke" ? "ALL" : "UTILITY");
            }}
          >
            {canGrant && <option value="grant">Registrar autorização</option>}
            <option value="revoke">Registrar pedido de interrupção</option>
          </select>
        </label>
        {!canGrant && (
          <p>
            Um administrador pode registrar uma nova autorização. Você pode
            registrar pedidos de interrupção recebidos pelo cliente.
          </p>
        )}
        <label className="react-field">
          <span>Finalidade</span>
          <select
            value={scope}
            disabled={busy}
            onChange={(e) => setScope(e.target.value)}
          >
            {action === "revoke" && (
              <option value="ALL">Todas as mensagens</option>
            )}
            {Object.entries(SCOPES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {action === "grant" && (
          <label className="react-field">
            <span>O que o cliente autorizou receber?</span>
            <input
              required
              minLength={5}
              maxLength={500}
              value={purpose}
              disabled={busy}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Ex.: atualizações sobre o pedido 123"
            />
          </label>
        )}
        <label className="react-field">
          <span>Canal de origem</span>
          <select
            value={source}
            disabled={busy}
            onChange={(e) => setSource(e.target.value)}
          >
            {Object.entries(SOURCES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="react-field">
          <span>Data e hora do pedido do cliente</span>
          <input
            type="datetime-local"
            step="1"
            required
            value={occurredAt}
            disabled={busy}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="react-field">
          <span>Evidência ou referência do pedido</span>
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={3}
            disabled={busy}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Referência da mensagem, formulário ou atendimento em que o cliente fez o pedido"
          />
        </label>
        <small>
          Registre uma referência verificável. Evite copiar documentos, senhas
          ou dados sensíveis.
        </small>
        {action === "grant" && p.blockedAll && (
          <label className="react-check">
            <input
              type="checkbox"
              required
              checked={resume}
              disabled={busy}
              onChange={(e) => setResume(e.target.checked)}
            />
            O cliente deu uma nova autorização após a interrupção. Retomar
            somente esta finalidade.
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <ModalClose>Cancelar</ModalClose>
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar preferência"}
          </button>
        </div>
      </form>
      <details className="communication-history">
        <summary>
          Histórico de preferências ({history.length} registros recentes)
        </summary>
        {history.map((e) => (
          <article key={e.id}>
            <b>
              {e.action === "grant" ? "Autorização" : "Interrupção"} ·{" "}
              {SCOPES[e.scope] || "Todas as mensagens"}
            </b>
            <p>
              {new Date(e.occurredAt).toLocaleString("pt-BR")} · {e.actorName} ·{" "}
              {SOURCES[e.source] || "Mensagem do WhatsApp"}
            </p>
            {e.purpose && <p>{e.purpose}</p>}
            <p>{e.evidence}</p>
          </article>
        ))}
        {!history.length && (
          <p>
            Nenhum registro. Receber uma mensagem não cria autorização para
            campanhas.
          </p>
        )}
      </details>
    </Modal>
  );
}
