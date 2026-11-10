import { useState } from "react";
import { useCrm, useUi } from "../context.jsx";
import Crm from "../domain/crm.mjs";
import { Heading, Icon } from "../components/UI.jsx";
import { download } from "../services/format.mjs";
export default function Logs() {
  const { state, actor, visible, actions } = useCrm(),
    ui = useUi();
  const [category, setCategory] = useState("Geral"),
    [query, setQuery] = useState("");
  const entries = Crm.isAdmin(actor)
    ? state.audit
    : state.audit.filter(
        (e) =>
          e.actorId === actor.id || visible.some((c) => c.id === e.contactId),
      );
  const rows = entries
    .filter(
      (e) =>
        (category === "Geral" || e.category === category) &&
        `${e.actorName} ${e.contactName || ""} ${e.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice()
    .reverse();
  return (
    <>
      <Heading
        eyebrow="EVENTOS IMPORTANTES"
        title="Logs"
        description="Envios, alterações de responsabilidade e ações administrativas."
      >
        <button
          className="secondary"
          onClick={() => {
            actions.logExport("logs");
            download(JSON.stringify(entries, null, 2), "zapcaster-logs.json");
          }}
        >
          <Icon name="download" />
          Exportar
        </button>
      </Heading>
      <div className="audit-tabs">
        {["Geral", "Administrativo", "Conversas", "Login", "Sistema"].map(
          (x) => (
            <button
              key={x}
              className={category === x ? "active" : ""}
              aria-pressed={category === x}
              onClick={() => setCategory(x)}
            >
              {x}
              <span>
                {x === "Geral"
                  ? entries.length
                  : entries.filter((e) => e.category === x).length}
              </span>
            </button>
          ),
        )}
      </div>
      <label className="service-search audit-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Buscar logs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar evento, cliente ou atendente"
        />
      </label>
      <div className="audit-table-wrap">
        <table className="audit-table compact-audit">
          <thead>
            <tr>
              {[
                "Quando",
                "Categoria",
                "Quem",
                "O que aconteceu",
                "Cliente",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.at).toLocaleString("pt-BR")}</td>
                <td>{e.category}</td>
                <td>{e.actorName}</td>
                <td>
                  <b>{e.description}</b>
                  {e.details?.de && (
                    <small>
                      {e.details.de} → {e.details.para}
                      {e.details.setorAtual ? " · " + e.details.setorAtual : ""}
                    </small>
                  )}
                </td>
                <td>
                  {e.contactId && visible.some((c) => c.id === e.contactId) ? (
                    <button
                      className="audit-client"
                      onClick={() => ui.openConversation(e.contactId)}
                    >
                      {e.contactName}
                    </button>
                  ) : (
                    e.contactName || "—"
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5}>Nenhum evento importante neste filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="audit-count">
        {rows.length} eventos. Navegação, tema e mensagens recebidas não são
        armazenados neste log.
      </p>
    </>
  );
}
