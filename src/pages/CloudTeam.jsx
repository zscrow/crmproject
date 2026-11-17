import { useState } from "react";
import { useCrm, useUi } from "../context.jsx";
import { Heading, Avatar } from "../components/UI.jsx";
function Sectors({ sectors, selected, onChange }) {
  return (
    <fieldset className="cloud-sectors">
      <legend>Setores permitidos</legend>
      {sectors.map((sector) => (
        <label key={sector}>
          <input
            type="checkbox"
            checked={selected.includes(sector)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, sector]
                  : selected.filter((s) => s !== sector),
              )
            }
          />
          {sector}
        </label>
      ))}
    </fieldset>
  );
}
function Member({ person, sectors, store }) {
  const [role, setRole] = useState(
      person.role === "Administrador" ? "admin" : "agent",
    ),
    [selected, setSelected] = useState(person.allowedSectors),
    [caps, setCaps] = useState(person.capabilities || {}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [removing, setRemoving] = useState(false);
  async function remove() {
    if (!removing) {
      setRemoving(true);
      return;
    }
    setBusy(true);
    try {
      await store.removeMember(person.id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
      setRemoving(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await store.member({
        userId: person.id,
        role,
        sectors: selected,
        capabilities: caps,
      });
      setMessage("Acessos salvos no servidor.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="surface team-card cloud-member" onSubmit={save}>
      <Avatar contact={{ name: person.name, color: "blue" }} />
      <h2>{person.name}</h2>
      <p>{person.email}</p>
      <label>
        Papel
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="admin">Administrador</option>
          <option value="agent">Atendente</option>
        </select>
      </label>
      <Sectors sectors={sectors} selected={selected} onChange={setSelected} />
      {role === "agent" && (
        <fieldset className="cloud-sectors">
          <legend>Permissões adicionais</legend>
          {[
            ["viewLogs", "Consultar logs"],
            ["exportClients", "Exportar clientes"],
            ["editTemplates", "Editar templates"],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={!!caps[key]}
                onChange={(e) => setCaps({ ...caps, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <button className="secondary" disabled={busy || !selected.length}>
        Salvar acessos
      </button>
      <button
        className="secondary"
        type="button"
        disabled={busy}
        onClick={remove}
      >
        {removing ? "Confirmar remoção do acesso" : "Remover acesso"}
      </button>
      {removing && (
        <button
          type="button"
          className="secondary"
          onClick={() => setRemoving(false)}
        >
          Cancelar remoção
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
export default function CloudTeam() {
  const { state, store } = useCrm(),
    ui = useUi();
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("agent"),
    [sectors, setSectors] = useState([state.sectors[0]]),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setUrl("");
    try {
      const result = await store.invite({ email, role, sectors });
      setUrl(result.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="ADMINISTRAÇÃO"
        title="Equipe e acessos"
        description="Convide pessoas para esta empresa e defina os setores que cada uma pode acessar."
      />
      <form className="surface cloud-invite" onSubmit={invite}>
        <h2>Convidar para a empresa</h2>
        <p>
          O link vale por sete dias e só pode ser aceito pela conta com o e-mail
          indicado. Copie e compartilhe com a pessoa convidada.
        </p>
        <label>
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
          />
        </label>
        <label>
          Papel
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="agent">Atendente</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <Sectors
          sectors={state.sectors}
          selected={sectors}
          onChange={setSectors}
        />
        <button className="primary" disabled={busy || !sectors.length}>
          {busy ? "Gerando…" : "Gerar convite"}
        </button>
        {error && <p role="alert">{error}</p>}
        {url && (
          <div className="cloud-invite-link">
            <label>
              Link do convite
              <input readOnly value={url} onFocus={(e) => e.target.select()} />
            </label>
            <button
              className="secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  ui.notify("Convite copiado.");
                } catch {
                  ui.notify("Selecione e copie o link do convite.");
                }
              }}
            >
              Copiar link
            </button>
          </div>
        )}
      </form>
      <div className="profile-policy">
        As permissões são verificadas no servidor em cada consulta e alteração.
        Administradores acessam todos os setores. Mantenha pelo menos um
        administrador.
      </div>
      <div className="team-grid">
        {state.team.map((person) => (
          <Member
            key={
              person.id +
              ":" +
              person.role +
              ":" +
              JSON.stringify(person.allowedSectors) +
              ":" +
              JSON.stringify(person.capabilities)
            }
            person={person}
            sectors={state.sectors}
            store={store}
          />
        ))}
      </div>
    </>
  );
}
