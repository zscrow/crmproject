import { useEffect, useState, useSyncExternalStore } from "react";
import { createCloudStore, workspaceApi } from "./services/cloud-store.mjs";
import { initialState } from "./store.mjs";
import { useCrm } from "./context.jsx";
import { setMediaAccount } from "./services/media.mjs";
export function WorkspaceLoader({ user, children }) {
  const [store, setStore] = useState(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let mounted = true,
      current;
    workspaceApi()
      .then((data) => {
        if (!mounted) return;
        setMediaAccount(data.workspace.id);
        current = createCloudStore(data);
        setStore(current);
      })
      .catch((err) => {
        if (mounted) setError(err.message);
      });
    return () => {
      mounted = false;
      current?.dispose();
    };
  }, [user.id, retry]);
  useEffect(() => {
    if (!store) return;
    const tick = () => store.refresh();
    const id = setInterval(tick, 10000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [store]);
  if (error && !store)
    return (
      <div className="auth-screen">
        <div className="auth-main">
          <h1>Não foi possível abrir sua empresa</h1>
          <p role="alert">{error}</p>
          <button
            className="auth-submit"
            onClick={() => {
              setError("");
              setRetry(retry + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  if (!store)
    return (
      <div className="auth-screen">
        <p role="status">Carregando sua empresa…</p>
      </div>
    );
  return children(store);
}
export function CloudControls() {
  const { store } = useCrm();
  if (!store.cloud) return null;
  return <Controls store={store} />;
}
export function InboxLabel() {
  const { store } = useCrm();
  return store.cloud ? (
    <ConnectedInbox store={store} />
  ) : (
    <>Integração em preparação</>
  );
}
function ConnectedInbox({ store }) {
  const cloud = useSyncExternalStore(store.subscribe, store.getCloudSnapshot),
    [busy, setBusy] = useState(false);
  if (!cloud.inbox?.connected) return <>Integração em preparação</>;
  return (
    <>
      {cloud.inbox.lastMessageAt
        ? "Recebimento conectado"
        : "Recebimento configurado"}
      <br />
      Respostas de texto · janela de 24h
      <button
        className="inbox-refresh"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await store.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Atualizando…" : "Atualizar mensagens"}
      </button>
    </>
  );
}
function Controls({ store }) {
  const cloud = useSyncExternalStore(store.subscribe, store.getCloudSnapshot);
  const [error, setError] = useState("");
  return (
    <div className="cloud-controls">
      <label>
        Empresa
        <select
          aria-label="Empresa ativa"
          value={cloud.workspace.id}
          disabled={cloud.status === "saving"}
          onChange={async (e) => {
            try {
              await store.switchWorkspace(e.target.value);
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          {cloud.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <span role="status">
        {cloud.status === "saving"
          ? "Salvando na nuvem…"
          : cloud.status === "error"
            ? "Sincronização pendente"
            : "Salvo na nuvem"}
      </span>
      {(cloud.error || cloud.inbox?.error || error) && (
        <p role="alert">
          {cloud.error || cloud.inbox?.error || error}{" "}
          <button className="secondary" onClick={() => store.refresh()}>
            Atualizar
          </button>
        </p>
      )}
    </div>
  );
}
export function WorkspaceOnboarding({ user, store }) {
  const [invite, setInvite] = useState(
      () => new URLSearchParams(location.search).get("invite") || "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dismissed, setDismissed] = useState(false);
  const [local] = useState(() => {
    try {
      const prefix = "klivo:" + user.id + ":";
      if (!localStorage.getItem(prefix + "zc-contacts")) return null;
      return initialState({
        getItem: (key) => localStorage.getItem(prefix + key),
      });
    } catch {
      return null;
    }
  });
  const { state } = useCrm();
  async function join() {
    setBusy(true);
    try {
      await workspaceApi("/join", { token: invite });
      history.replaceState(null, "", "/");
      location.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function migrate() {
    setBusy(true);
    try {
      await store.importLocal(local);
      setDismissed(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (!invite && (!local || dismissed || state.contacts.length)) return null;
  return (
    <section className="cloud-onboarding surface">
      {invite ? (
        <>
          <h2>Convite para uma equipe</h2>
          <p>
            Aceite somente se você conhece quem enviou este link. O convite deve
            corresponder ao e-mail da sua conta.
          </p>
          <button className="primary" disabled={busy} onClick={join}>
            Aceitar convite
          </button>
          <button
            className="secondary"
            onClick={() => {
              history.replaceState(null, "", "/");
              setInvite("");
            }}
          >
            Ignorar
          </button>
        </>
      ) : (
        <>
          <h2>Encontramos dados da versão anterior neste navegador</h2>
          <p>
            Você pode importar contatos, anotações e histórico de texto para
            esta empresa. Anexos locais não são transferidos. Seus dados
            originais serão preservados. Essa cópia pode incluir os contatos de
            exemplo da versão anterior.
          </p>
          <button className="primary" disabled={busy} onClick={migrate}>
            Importar dados deste navegador
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setDismissed(true)}
          >
            Começar em branco
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
