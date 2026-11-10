import { useState } from "react";
import { useCrm, useUi } from "../context.jsx";
import Crm from "../domain/crm.mjs";
import { Avatar, Heading, Icon, Empty } from "../components/UI.jsx";
import { csv, download } from "../services/format.mjs";
export default function Contacts() {
  const { state, actor, visible, actions } = useCrm(),
    ui = useUi();
  const [query, setQuery] = useState(""),
    [sector, setSector] = useState(""),
    [filter, setFilter] = useState("Todos os contatos"),
    [view, setView] = useState("grid"),
    [sort, setSort] = useState("name");
  const allowed = Crm.allowedSectors(actor, state.sectors);
  const chosen = allowed.includes(sector) ? sector : "";
  const matches = (c) =>
    (filter !== "Favoritos" || c.favorite) &&
    (filter !== "Clientes" || c.tag === "Cliente") &&
    (filter !== "Leads" || c.tag === "Lead");
  const list = visible
    .filter(
      (c) =>
        matches(c) &&
        (!chosen || c.sector === chosen) &&
        `${c.name} ${c.company} ${c.phone}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name, "pt-BR") : b.id - a.id,
    );
  return (
    <>
      <Heading
        eyebrow="RELACIONAMENTOS"
        title="Clientes"
        description="Sua base completa, com contatos e histórico sempre disponíveis."
      >
        <button
          className="primary"
          onClick={() => ui.setDialog({ type: "contact" })}
        >
          <Icon name="plus" />
          Novo contato
        </button>
      </Heading>
      <section className="contacts-panel" aria-label="Base de contatos">
        <div className="tabs">
          {["Todos os contatos", "Clientes", "Leads", "Favoritos"].map((t) => (
            <button
              key={t}
              aria-pressed={filter === t}
              className={`tab ${filter === t ? "selected" : ""}`}
              onClick={() => setFilter(t)}
            >
              {t}
              <span>
                {t === "Todos os contatos"
                  ? visible.length
                  : visible.filter((c) =>
                      t === "Favoritos"
                        ? c.favorite
                        : c.tag === (t === "Clientes" ? "Cliente" : "Lead"),
                    ).length}
              </span>
            </button>
          ))}
          {Crm.capability(actor, "exportClients") && (
            <button
              className="export"
              onClick={() => {
                download(
                  csv(visible),
                  "clientes-zapcaster.csv",
                  "text/csv;charset=utf-8",
                );
                actions.logExport("clientes");
              }}
            >
              <Icon name="download" />
              Exportar contatos
            </button>
          )}
        </div>
        <div className="toolbar">
          <label className="filter-field search-field">
            <span>Buscar contato</span>
            <span className="search">
              <Icon name="search" />
              <input
                type="search"
                placeholder="Nome, empresa ou telefone"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </span>
          </label>
          <label className="filter-field">
            <span>Setor</span>
            <select value={chosen} onChange={(e) => setSector(e.target.value)}>
              <option value="">Todos os setores</option>
              {allowed.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Ordenar por</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">Nome: A a Z</option>
              <option value="recent">Mais recentes</option>
            </select>
          </label>
          <div className="filter-field">
            <span>Visualização</span>
            <div className="view-switch">
              {[
                ["grid", "Cards"],
                ["list", "Lista"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={view === id}
                  className={view === id ? "on" : ""}
                  onClick={() => setView(id)}
                >
                  <Icon name={id === "grid" ? "grid" : "list"} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="results-label">
          <span role="status">{list.length} contatos encontrados</span>
          {(query || chosen || filter !== "Todos os contatos") && (
            <button
              onClick={() => {
                setQuery("");
                setSector("");
                setFilter("Todos os contatos");
              }}
            >
              Limpar filtros ×
            </button>
          )}
        </div>
        <div className={`contact-grid ${view === "list" ? "list-view" : ""}`}>
          {list.map((c) => (
            <article
              key={c.id}
              className="contact-card client-clickable"
              role="group"
              tabIndex={0}
              aria-label={`Cliente ${c.name}`}
              onClick={(e) => {
                if (!e.target.closest("button")) ui.openConversation(c.id);
              }}
              onKeyDown={(e) => {
                if (
                  e.target === e.currentTarget &&
                  ["Enter", " "].includes(e.key)
                ) {
                  e.preventDefault();
                  ui.openConversation(c.id);
                }
              }}
            >
              <div className="card-top">
                <Avatar contact={c} />
                <div className="contact-identity">
                  <h2>{c.name}</h2>
                  <div className="company">
                    {c.company || "Empresa não informada"}
                  </div>
                </div>
                <button
                  className={`favorite ${c.favorite ? "is-favorite" : ""}`}
                  aria-label={`${c.favorite ? "Remover dos favoritos" : "Favoritar"} ${c.name}`}
                  aria-pressed={!!c.favorite}
                  onClick={() => actions.favorite(c.id)}
                >
                  <Icon name="star" />
                </button>
              </div>
              <div className="tags">
                <span className={`tag ${c.tag?.toLowerCase()}`}>
                  {c.tag === "Lead" ? "Lead · potencial cliente" : c.tag}
                </span>
                <span className="sector-tag">
                  <Icon name="sectors" />
                  {c.sector}
                </span>
              </div>
              <div className="contact-info">
                <div>
                  <Icon name="phone" />
                  <span>{c.phone}</span>
                </div>
                <div>
                  <Icon name="mail" />
                  <span>{c.email || "E-mail não informado"}</span>
                </div>
              </div>
              <div className="last-activity">
                <Icon name="clock" />
                Última atividade: {c.last?.toLowerCase() || "não registrada"}
              </div>
              <div className="card-bottom">
                <button
                  className="secondary"
                  aria-label={`Editar ${c.name}`}
                  onClick={() =>
                    ui.setDialog({ type: "contact", contactId: c.id })
                  }
                >
                  <Icon name="edit" />
                  Editar
                </button>
                <button
                  className="primary"
                  aria-label={`Conversar com ${c.name}`}
                  onClick={() => ui.openConversation(c.id)}
                >
                  <Icon name="chat" />
                  Conversar
                </button>
              </div>
            </article>
          ))}
          {!list.length && (
            <Empty
              title="Nenhum contato encontrado"
              description="Experimente outra busca ou remova os filtros."
            />
          )}
        </div>
        <div className="panel-footer">
          Mostrando {list.length} de {visible.length} contatos
          <span>Seus relacionamentos em um só lugar</span>
        </div>
      </section>
    </>
  );
}
