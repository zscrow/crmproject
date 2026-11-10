import { useCrm, useUi } from "../context.jsx";
import Crm from "../domain/crm.mjs";
import { Avatar, Heading, Icon } from "../components/UI.jsx";
export default function Team() {
  const { state, actor } = useCrm(),
    ui = useUi();
  if (!Crm.isAdmin(actor)) return null;
  return (
    <>
      <Heading
        eyebrow="ADMINISTRAÇÃO"
        title="Equipe e perfis"
        description="Defina o papel e os setores visíveis para cada pessoa."
      >
        <button
          className="primary"
          onClick={() => ui.setDialog({ type: "profile" })}
        >
          <Icon name="plus" />
          Novo usuário
        </button>
      </Heading>
      <div className="profile-policy">
        Os setores escolhidos controlam o que aparece para o colaborador neste
        protótipo. A autorização definitiva será aplicada no servidor.
      </div>
      <div className="team-grid">
        {state.team.map((a) => (
          <article className="surface team-card" key={a.id}>
            <Avatar contact={{ name: a.name, color: "blue" }} />
            <h2>{a.name}</h2>
            <p>{a.role}</p>
            <div className="profile-sector-chips">
              {Crm.allowedSectors(a, state.sectors).map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            <button
              className="secondary"
              onClick={() => ui.setDialog({ type: "profile", id: a.id })}
            >
              Editar perfil e acessos
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
