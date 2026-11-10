import { useState } from "react";
import { useCrm, useUi } from "../context.jsx";
import Crm from "../domain/crm.mjs";
import Service from "../domain/service.mjs";
import { Heading, Icon, Empty } from "../components/UI.jsx";
export default function Templates() {
  const { state, actor } = useCrm(),
    ui = useUi();
  const [tab, setTab] = useState("quick");
  const canEdit = Crm.capability(actor, "editTemplates");
  const list = (
    tab === "quick" ? state.quickReplies : state.waTemplates
  ).filter((t) => !t.archived);
  return (
    <>
      <Heading
        eyebrow="SUA BIBLIOTECA"
        title="Templates"
        description="Personalize respostas rápidas e modelos do WhatsApp."
      >
        {canEdit && (
          <button
            className="primary"
            onClick={() => ui.setDialog({ type: "template", kind: tab })}
          >
            <Icon name="plus" />
            {tab === "quick" ? "Nova mensagem pronta" : "Novo modelo local"}
          </button>
        )}
      </Heading>
      <div className="message-library-tabs">
        {[
          ["quick", "Mensagens prontas", state.quickReplies],
          ["whatsapp", "Modelos WhatsApp", state.waTemplates],
        ].map(([id, label, items]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            <span>{items.filter((t) => !t.archived).length}</span>
          </button>
        ))}
      </div>
      <div className="library-info">
        {!canEdit
          ? "Templates disponíveis para consulta e uso nos atalhos. O administrador controla quem pode editar."
          : tab === "quick"
            ? "Digite um atalho completo, como /ola, na conversa. Ele se transforma no texto automaticamente, sem Enter. Configure aqui o Pix e os demais campos personalizados."
            : "Cadastros locais são rascunhos. O envio real fora das 24h exige aprovação pela Meta. Nesta prévia, modelos podem ser simulados sem envio ou cobrança."}
      </div>
      <div className="message-library-grid">
        {list.map((t) => (
          <article className="surface library-card" key={t.id}>
            <header>
              <h2>{t.title}</h2>
              <span className="library-label">
                {tab === "quick"
                  ? "/" + t.shortcut
                  : t.status === "example"
                    ? "Exemplo · demo"
                    : "Rascunho local"}
              </span>
            </header>
            <p>{t.body}</p>
            {Service.variables(t.body).length > 0 && (
              <div className="template-fields">
                Campos:{" "}
                {Service.variables(t.body).map((v) => (
                  <span key={v}>{v}</span>
                ))}
              </div>
            )}
            {canEdit && (
              <button
                className="secondary"
                onClick={() =>
                  ui.setDialog({ type: "template", kind: tab, id: t.id })
                }
              >
                <Icon name="edit" />
                Personalizar
              </button>
            )}
          </article>
        ))}
        {!list.length && (
          <Empty
            title="Sua biblioteca está vazia"
            description="Crie um template para começar."
          />
        )}
      </div>
    </>
  );
}
