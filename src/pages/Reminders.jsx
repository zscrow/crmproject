import { useCrm, useUi } from "../context.jsx";
import { Heading, Icon, Empty } from "../components/UI.jsx";
export default function Reminders() {
  const { state, visible, actions } = useCrm(),
    ui = useUi();
  const items = state.reminders.filter((r) =>
    visible.some((c) => c.id === r.contactId),
  );
  return (
    <>
      <Heading
        eyebrow="ORGANIZAÇÃO"
        title="Lembretes"
        description="Acompanhe retornos e próximos passos sem perder o contexto."
      >
        <button
          className="primary"
          onClick={() => ui.setDialog({ type: "reminder" })}
        >
          <Icon name="plus" />
          Novo lembrete
        </button>
      </Heading>
      <p className="reminder-notice">
        <Icon name="clock" />
        Lembretes locais: consulte esta tela para acompanhar os prazos. Não há
        alertas fora do aplicativo.
      </p>
      <div className="reminder-columns">
        {[false, true].map((done) => {
          const list = items
            .filter((r) => r.done === done)
            .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
          return (
            <section className="surface reminder-panel" key={String(done)}>
              <h2>
                {done ? "Concluídos" : "Pendentes"} <span>{list.length}</span>
              </h2>
              {list.map((r) => (
                <article className="reminder-item" key={r.id}>
                  <div className="reminder-item-heading">
                    <h3>{r.text}</h3>
                    <span
                      className={`tag ${!done && Date.parse(r.at) < Date.now() ? "lead" : "cliente"}`}
                    >
                      {done
                        ? "Concluído"
                        : Date.parse(r.at) < Date.now()
                          ? "Prazo vencido"
                          : "Pendente"}
                    </span>
                  </div>
                  <p>
                    {visible.find((c) => c.id === r.contactId)?.name} ·{" "}
                    {new Date(r.at).toLocaleString("pt-BR")}
                  </p>
                  <div className="reminder-item-actions">
                    <button
                      className="secondary"
                      onClick={() => actions.toggleReminder(r.id)}
                    >
                      {done ? "Reabrir" : "Concluir"}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => ui.openConversation(r.contactId)}
                    >
                      Abrir conversa <Icon name="arrow" />
                    </button>
                  </div>
                </article>
              ))}
              {!list.length &&
                (done ? (
                  <p className="no-reminders">
                    Os lembretes concluídos aparecerão aqui.
                  </p>
                ) : (
                  <Empty
                    title="Tudo em dia"
                    description="Crie um lembrete para retornar a um cliente."
                  />
                ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
