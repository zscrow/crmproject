import { useRef, useState } from "react";
import { useCrm, useUi, useNow } from "../context.jsx";
import Crm from "../domain/crm.mjs";
import Service from "../domain/service.mjs";
import { Avatar, Icon, Empty } from "../components/UI.jsx";
export default function Attendance() {
  useNow();
  const { state, actions, actor, visible } = useCrm(),
    ui = useUi();
  const [mineOnly, setMineOnly] = useState(false),
    [sector, setSector] = useState(""),
    [query, setQuery] = useState(""),
    [unanswered, setUnanswered] = useState(false);
  const shelf = useRef(),
    drag = useRef(null);
  const open = visible.filter((c) => c.sessionState === "open");
  const sectorOrder = [
    "Impressão",
    "Arte",
    "E-commerce",
    "Triagem",
    "Financeiro",
  ];
  const allowed = Crm.allowedSectors(actor, [
    ...sectorOrder.filter((s) => state.sectors.includes(s)),
    ...state.sectors.filter((s) => !sectorOrder.includes(s)),
  ]);
  const effectiveSector = allowed.includes(sector) ? sector : "";
  let list = open.filter(
    (c) =>
      (!mineOnly || c.assigneeId === actor.id) &&
      (!effectiveSector || c.sector === effectiveSector) &&
      (!unanswered || Service.isWaiting(c)) &&
      `${c.name} ${c.phone} ${c.company}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  list = list
    .slice()
    .sort((a, b) =>
      state.serviceSort === "name"
        ? a.name.localeCompare(b.name, "pt-BR")
        : state.serviceSort === "recent"
          ? Date.parse(b.lastInboundAt) - Date.parse(a.lastInboundAt)
          : Number(Service.isWaiting(b)) - Number(Service.isWaiting(a)) ||
            Service.waitMs(b) - Service.waitMs(a) ||
            Date.parse(b.lastInboundAt) - Date.parse(a.lastInboundAt),
    );
  return (
    <>
      <div className="service-heading">
        <div>
          <h1>Atendimentos</h1>
          <p>
            {open.length} conversas em aberto. Uma fila simples para o seu dia.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => ui.setDialog({ type: "contact" })}
        >
          <Icon name="plus" />
          Novo cliente
        </button>
      </div>
      <div
        className="sector-quickbar"
        aria-label="Setores de atendimento"
        ref={shelf}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse")
            drag.current = {
              x: e.clientX,
              left: shelf.current.scrollLeft,
              moved: false,
            };
        }}
        onPointerMove={(e) => {
          if (drag.current && Math.abs(e.clientX - drag.current.x) > 5) {
            drag.current.moved = true;
            shelf.current.scrollLeft =
              drag.current.left - (e.clientX - drag.current.x);
          }
        }}
        onPointerUp={() =>
          setTimeout(() => {
            drag.current = null;
          }, 0)
        }
        onPointerLeave={() => {
          drag.current = null;
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {["", ...allowed].map((s) => (
          <button
            key={s}
            className={effectiveSector === s ? "active" : ""}
            aria-pressed={effectiveSector === s}
            onClick={() => setSector(s)}
          >
            {s || "Automático"}
            <span>
              {s ? open.filter((c) => c.sector === s).length : open.length}
            </span>
          </button>
        ))}
      </div>
      <div className="service-toolbar">
        <label className="service-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Buscar atendimento"
            placeholder="Buscar cliente ou telefone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className={`unanswered-filter mine-filter ${mineOnly ? "active" : ""}`}
          aria-pressed={mineOnly}
          onClick={() => setMineOnly(!mineOnly)}
        >
          Só meus atendimentos
        </button>
        <label className="queue-sort-control">
          <span className="sr-only">Organizar atendimentos</span>
          <select
            value={state.serviceSort}
            onChange={(e) => actions.setSort(e.target.value)}
          >
            <option value="unanswered">Não respondidos primeiro</option>
            <option value="recent">Mais recentes</option>
            <option value="name">Nome: A a Z</option>
          </select>
        </label>
        <button
          className={`unanswered-filter ${unanswered ? "active" : ""}`}
          aria-pressed={unanswered}
          onClick={() => setUnanswered(!unanswered)}
        >
          Somente sem resposta
        </button>
        {(query || effectiveSector || mineOnly || unanswered) && (
          <button
            className="clear-service"
            onClick={() => {
              setQuery("");
              setSector("");
              setMineOnly(false);
              setUnanswered(false);
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>
      <div className="service-grid compact-service-grid">
        {list.map((c) => (
          <ServiceCard key={c.id} contact={c} />
        ))}
        {!list.length && (
          <Empty description="Nenhum atendimento neste filtro.">
            <button
              className="secondary"
              onClick={() => ui.navigate("contacts")}
            >
              Ver clientes
            </button>
          </Empty>
        )}
      </div>
      <div className="card-color-legend">
        <span>
          <i className="legend-orange" />
          Aguardando resposta ou perto de fechar
        </span>
        <span>
          <i className="legend-blue" />
          Respondido
        </span>
        <span>
          <i className="legend-red" />
          Finalizado
        </span>
      </div>
    </>
  );
}
export function ServiceCard({ contact: c }) {
  const ui = useUi(),
    status = Crm.cardState(c),
    closed = c.sessionState === "closed";
  return (
    <article className={`service-tile state-${status}`}>
      <button
        className="service-tile-main"
        aria-label={`${closed ? "Ver histórico de" : "Abrir atendimento de"} ${c.name}`}
        onClick={() => ui.openConversation(c.id)}
      >
        <div>
          <Avatar contact={c} />
          <span>
            <b>{c.name}</b>
            <small>{c.phone}</small>
          </span>
          {status === "ending" && (
            <i
              className="ending-indicator"
              title="Janela termina em até 2 horas"
            >
              <Icon name="clock" />
            </i>
          )}
        </div>
        <p>{c.preview || "Inicie o atendimento."}</p>
      </button>
      <footer className="service-tile-footer">
        <span>{c.sector}</span>
        <button
          aria-label={`Detalhes de ${c.name}`}
          onClick={() => ui.setDialog({ type: "details", contactId: c.id })}
        >
          Detalhes <Icon name="arrow" />
        </button>
      </footer>
    </article>
  );
}
