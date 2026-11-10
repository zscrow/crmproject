import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCrm, useUi, useNow } from "../context.jsx";
import Crm from "../domain/crm.mjs";
import Session from "../domain/session.mjs";
import Service from "../domain/service.mjs";
import { Avatar, Icon } from "../components/UI.jsx";
import { duration, remaining } from "../services/format.mjs";
import { groupMessagesByDay, dayLabel } from "../services/chatDates.mjs";
import Message from "../components/Message.jsx";
import { messageKey, quoteMessage } from "../services/chat.mjs";
import Composer from "../components/Composer.jsx";
export default function Conversation() {
  const { state, actions, actor, visible } = useCrm(),
    ui = useUi();
  const [reply, setReply] = useState(null),
    [query, setQuery] = useState(""),
    [details, setDetails] = useState(false),
    [showList, setShowList] = useState(false);
  const now = useNow(),
    listRef = useRef(),
    stick = useRef(true);
  const c = visible.find((c) => c.id === ui.selected);
  const messages = state.messages[c?.id] || [];
  const mine = visible.filter(
    (c) => c.sessionState === "open" && c.assigneeId === actor.id,
  );
  const open = mine.filter(
    (c) =>
      c.sessionState === "open" &&
      c.name.toLowerCase().includes(query.toLowerCase()),
  );
  const owner = state.team.find((a) => a.id === c?.assigneeId);
  useEffect(() => {
    setReply(null);
    setDetails(false);
    setShowList(false);
    stick.current = true;
  }, [c?.id]);
  useLayoutEffect(() => {
    if (listRef.current && stick.current)
      listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [c?.id, messages.length]);
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (stick.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [c?.id]);
  if (!c) return null;
  const closed = c.sessionState === "closed";
  const perform = (fn) => {
    try {
      fn();
    } catch (error) {
      ui.notify(error.message);
    }
  };
  return (
    <div
      className={`conversation-layout ${showList ? "" : "conversation-selected"} ${details ? "show-customer" : ""}`}
    >
      <aside className="conversation-list">
        <div className="conversation-list-title">
          <button
            className="conversation-back"
            onClick={() => ui.navigate("attendance")}
          >
            ← Atendimentos
          </button>
          <h2>
            Meus atendimentos <span>{mine.length}</span>
          </h2>
        </div>
        <label className="inbox-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Buscar conversa"
            placeholder="Buscar conversa"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="conversation-list-items">
          {open.map((x) => (
            <button
              key={x.id}
              className={`conversation-person ${x.id === c.id ? "selected" : ""}`}
              onClick={() => {
                ui.openConversation(x.id);
                setShowList(false);
              }}
            >
              <Avatar contact={x} />
              <span>
                <b>{x.name}</b>
                <small>{x.preview || "Iniciar conversa"}</small>
              </span>
              {Service.isWaiting(x) && <i className="unread-dot" />}
            </button>
          ))}
          {!open.length && (
            <div className="list-empty">
              Você não tem atendimentos em aberto.
            </div>
          )}
        </div>
      </aside>
      <section className="conversation-main">
        <header className="conversation-header">
          <button
            className="secondary conversation-mobile-back"
            onClick={() => setShowList(true)}
          >
            ← Voltar
          </button>
          <Avatar contact={c} />
          <div className="conversation-title">
            <h1>{c.name}</h1>
            <span>
              {c.phone} · {c.sector}
            </span>
          </div>
          <div className="conversation-header-actions">
            <button
              className="secondary"
              aria-expanded={details}
              onClick={() => setDetails(!details)}
            >
              <Icon name="contacts" />
              Dados do cliente
            </button>
            {!closed ? (
              <button
                className="finish-button"
                onClick={() =>
                  perform(() => {
                    actions.close(c.id);
                    ui.navigate("attendance");
                    ui.notify(
                      "Atendimento finalizado. Cliente e histórico preservados.",
                    );
                  })
                }
              >
                ✓ Finalizar atendimento
              </button>
            ) : Session.canReply(c, now) ? (
              <button
                className="primary"
                onClick={() => perform(() => actions.reopen(c.id))}
              >
                Reabrir atendimento
              </button>
            ) : (
              <span className="finished-label">
                {c.closedReason === "not_started"
                  ? "Novo cliente"
                  : "✓ Finalizado"}
              </span>
            )}
          </div>
        </header>
        <div className="ownership-controls">
          <div className="owner-identity">
            <span className="owner-label">Responsável</span>
            <b>{owner?.name || "Sem atendente"}</b>
            <small>{c.sector}</small>
          </div>
          <div className="ownership-actions">
            {c.assigneeId !== actor.id ? (
              <button
                className="claim-button"
                onClick={() => perform(() => actions.claim(c.id))}
              >
                <Icon name="shield" />
                Assumir atendimento
              </button>
            ) : (
              <span className="mine-badge">✓ Com você</span>
            )}
            <button
              className="secondary"
              onClick={() =>
                ui.setDialog({ type: "transfer", contactId: c.id })
              }
            >
              <Icon name="arrow" />
              Transferir
            </button>
            <button
              className="secondary"
              onClick={() => ui.setDialog({ type: "note", contactId: c.id })}
            >
              <Icon name="edit" />
              Anotações{c.note ? " (1)" : ""}
            </button>
          </div>
        </div>
        <div className="conversation-window">
          <span>
            <i className={closed ? "ended" : ""} />
            {closed
              ? c.closedReason === "not_started"
                ? "Aguardando início"
                : "Atendimento finalizado"
              : remaining(c, now)}
          </span>
          <span>
            {closed
              ? c.closedReason === "not_started"
                ? "Novo cadastro"
                : "Histórico preservado"
              : `Responsável: ${owner?.name || "Não atribuído"}`}
          </span>
          {!closed && (
            <span className="wait-clock">
              {Service.isWaiting(c)
                ? "Cliente esperando há " + duration(Service.waitMs(c, now))
                : "Cliente respondido"}
            </span>
          )}
        </div>
        <div className="conversation-history">
          <div
            className="conversation-messages"
            role="log"
            aria-label="Histórico de mensagens"
            ref={listRef}
            onScroll={(e) => {
              const n = e.currentTarget;
              stick.current =
                n.scrollHeight - n.clientHeight - n.scrollTop < 80;
            }}
            onLoadCapture={() => {
              if (stick.current && listRef.current)
                listRef.current.scrollTop = listRef.current.scrollHeight;
            }}
          >
            {groupMessagesByDay(messages).map((group) => (
              <section
                className="conversation-day"
                data-message-day={group.date || ""}
                key={group.id}
                aria-label={dayLabel(group.date, now)}
              >
                <div className="conversation-day-label">
                  <span>{dayLabel(group.date, now)}</span>
                </div>
                {group.messages.map(({ message: m, index: i }) => (
                  <Message
                    key={messageKey(m, i)}
                    messageId={messageKey(m, i)}
                    message={m}
                    contactId={c.id}
                    onReply={
                      !closed && Session.canReply(c, now)
                        ? () => setReply(quoteMessage(m, messageKey(m, i)))
                        : undefined
                    }
                  />
                ))}
              </section>
            ))}
            {!messages.length && (
              <div className="message-empty">
                O histórico desta pessoa aparecerá aqui.
              </div>
            )}
            {closed && c.closedReason === "window_expired" && (
              <div className="conversation-event">
                A janela de 24 horas terminou. O atendimento saiu da fila. As
                mensagens continuam salvas.
              </div>
            )}
          </div>
        </div>
        {closed ? (
          <div className="closed-composer">
            <b>
              {c.closedReason === "not_started"
                ? "Cliente cadastrado. Vamos iniciar?"
                : "Esta conversa está finalizada."}
            </b>
            <p>
              {c.closedReason === "not_started"
                ? "Inicie o contato com um modelo aprovado. A resposta do cliente abre a janela de atendimento."
                : Session.canReply(c, now)
                  ? "Você pode reabrir enquanto a janela de atendimento estiver válida."
                  : "Use um modelo aprovado do WhatsApp para retomar o contato. A resposta do cliente abre outras 24h."}
            </p>
            <div className="closed-actions">
              <button
                className="primary"
                onClick={() =>
                  ui.setDialog({ type: "whatsapp", contactId: c.id })
                }
              >
                Enviar modelo WhatsApp
              </button>
              <button
                className="secondary"
                onClick={() => ui.navigate("attendance")}
              >
                Voltar aos atendimentos
              </button>
            </div>
          </div>
        ) : (
          <Composer
            key={c.id}
            contact={c}
            reply={reply}
            onCancelReply={() => setReply(null)}
          />
        )}{" "}
        {Crm.isAdmin(actor) && (
          <details className="demo-simulator">
            <summary>Testar recebimento · demonstração</summary>
            <p>Uma mensagem simulada renova a janela do cliente.</p>
            <button
              className="secondary"
              onClick={() =>
                ui.setDialog({ type: "incoming", contactId: c.id })
              }
            >
              Simular mensagem do cliente
            </button>
          </details>
        )}
      </section>
      {details && (
        <aside className="customer-panel">
          <div className="customer-panel-heading">
            <h2>Dados do cliente</h2>
            <button className="secondary" onClick={() => setDetails(false)}>
              Fechar
            </button>
          </div>
          <Avatar contact={c} />
          <h3>{c.name}</h3>
          <p>{c.company}</p>
          <dl>
            <dt>Telefone</dt>
            <dd>{c.phone}</dd>
            <dt>E-mail</dt>
            <dd>{c.email || "Não informado"}</dd>
            <dt>Atendente responsável</dt>
            <dd>{owner?.name || "Não atribuído"}</dd>
            <dt>Setor</dt>
            <dd>{c.sector}</dd>
          </dl>
          <button
            className="secondary"
            onClick={() => ui.setDialog({ type: "contact", contactId: c.id })}
          >
            <Icon name="edit" />
            Editar cliente
          </button>
          <div className="customer-note">
            <h3>Nota interna</h3>
            <p>{c.note || "Nenhuma nota por enquanto."}</p>
            <button
              className="secondary"
              onClick={() => ui.setDialog({ type: "note", contactId: c.id })}
            >
              Editar nota
            </button>
          </div>
          <details className="customer-more">
            <summary>Mais opções</summary>
            <button
              className="secondary"
              onClick={() =>
                ui.setDialog({ type: "transfer", contactId: c.id })
              }
            >
              Setor e atendente
            </button>
            <button
              className="secondary"
              onClick={() =>
                ui.setDialog({ type: "reminder", contactId: c.id })
              }
            >
              Criar lembrete
            </button>
          </details>
        </aside>
      )}
    </div>
  );
}
