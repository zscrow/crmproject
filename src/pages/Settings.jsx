import { useState } from "react";
import { useCrm, useUi } from "../context.jsx";
import Crm from "../domain/crm.mjs";
import { Avatar, Heading, Icon } from "../components/UI.jsx";
export default function Settings() {
  const { state, actor, actions, store } = useCrm(),
    ui = useUi();
  const [data, setData] = useState({
    name: actor.name,
    email: state.profile.email,
    company: state.profile.company,
  });
  if (!Crm.isAdmin(actor))
    return (
      <>
        <Heading
          eyebrow="MINHA CONTA"
          title="Meu perfil"
          description="Seus dados e setores de atendimento."
        />
        <section className="surface staff-profile">
          <Avatar contact={{ name: actor.name, color: "blue" }} />
          <h2>{actor.name}</h2>
          <p>{actor.role}</p>
          <div className="profile-sector-chips">
            {Crm.allowedSectors(actor, state.sectors).map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <p className="form-hint">
            Peça ao administrador para alterar seu perfil ou seus acessos.
          </p>
        </section>
      </>
    );
  return (
    <>
      <Heading
        eyebrow="SEU WORKSPACE"
        title="Perfil e configurações"
        description="Gerencie seu perfil e as informações da sua empresa."
      />
      <div className="settings-links">
        <button
          className="secondary"
          onClick={() => ui.setDialog({ type: "sector" })}
        >
          <Icon name="sectors" />
          Gerenciar setores
        </button>
        <button className="secondary" onClick={() => ui.navigate("team")}>
          <Icon name="shield" />
          Permissões da equipe
        </button>
      </div>
      <form
        className="surface settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await actions.settings(data);
            ui.notify("Perfil atualizado");
          } catch (error) {
            ui.notify(error.message);
          }
        }}
      >
        <div className="profile-intro">
          <Avatar contact={{ name: actor.name, color: "blue" }} />
          <div>
            <h2>Perfil do administrador</h2>
            <p>Seus dados neste workspace</p>
          </div>
        </div>
        {[
          ["name", "Nome completo", "text"],
          ["email", "E-mail", "email"],
          ["company", "Nome da empresa", "text"],
        ].map(([key, label, type]) => (
          <label key={key}>
            {label}
            <input
              type={type}
              required
              readOnly={store.cloud && key==='name'}
              value={data[key]}
              onChange={(e) => setData({ ...data, [key]: e.target.value })}
            />
          </label>
        ))}
        <button className="primary">Salvar alterações</button>
        <div className="integration">
          <h3>WhatsApp Business Platform</h3>
          <p>
            O receptor de webhooks está disponível em /webhooks/whatsapp.
            Configure a URL HTTPS pública e o token de verificação no painel da
            Meta e assine o campo messages. Os eventos são armazenados no
            servidor. Os dados desta empresa são salvos na nuvem; a conexão dos
            eventos do WhatsApp com as conversas será feita na próxima etapa.
          </p>
          <a className="secondary" href="/whatsapp.html">
            Abrir WhatsApp de teste
          </a>
        </div>
      </form>
    </>
  );
}
