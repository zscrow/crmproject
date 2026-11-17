import { createContext, useContext, useEffect, useState } from "react";
import App from "./App.jsx";
import { WorkspaceLoader } from "./CloudWorkspace.jsx";
import "./styles/auth.css";
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
async function auth(path, body) {
  const response = await fetch("/api/auth/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Não foi possível acessar sua conta.");
  return result;
}
function AccountWorkspace({ user, onLogout }) {
  return (
    <AuthContext.Provider value={{ user, logout: onLogout }}>
      <WorkspaceLoader user={user}>
        {(store) => <App store={store} />}
      </WorkspaceLoader>
    </AuthContext.Provider>
  );
}
export function AccountControls() {
  const session = useAuth();
  const [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!session) return null;
  async function change(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await auth("password", {
        password: form.get("password"),
        newPassword: form.get("newPassword"),
      });
      await session.logout();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-controls">
      <span>{session.user.username || session.user.email}</span>
      <button className="secondary" onClick={() => setEditing(!editing)}>
        Alterar senha
      </button>
      <button className="secondary" onClick={session.logout}>
        Sair
      </button>
      {editing && (
        <div className="account-password">
          <form onSubmit={change}>
            <h2>Alterar senha</h2>
            <label>
              Senha atual
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              Nova senha
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <p>
              Use pelo menos 12 caracteres. Você entrará novamente após salvar.
            </p>
            {error && <p role="alert">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar nova senha"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
export default function Auth() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    auth("me")
      .then((result) => {
        if (mounted) setUser(result.user);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    const check = () =>
      auth("me")
        .then((result) => setUser(result.user))
        .catch(() => setUser(null));
    window.addEventListener("focus", check);
    const timer = setInterval(check, 60000);
    return () => {
      window.removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, [user?.id]);
  async function logout() {
    try {
      await auth("logout", {});
      setUser(null);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await auth("login", Object.fromEntries(form));
      setUser(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="auth-screen">
        <p role="status">Abrindo o Klivo…</p>
      </div>
    );
  if (user)
    return <AccountWorkspace key={user.id} user={user} onLogout={logout} />;
  return (
    <div className="auth-screen">
      <section className="auth-story">
        <a className="auth-brand" href="/">
          k<span>Klivo</span>
        </a>
        <div>
          <span className="auth-eyebrow">CADA CONVERSA, MAIS PERTO.</span>
          <h1>
            Seu atendimento.
            <br />
            No mesmo lugar.
          </h1>
          <p>
            Organize contatos, acompanhe sua equipe e dê atenção a cada
            conversa.
          </p>
        </div>
        <small>Feito para aproximar pessoas.</small>
      </section>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <span className="auth-eyebrow">BEM-VINDO AO KLIVO</span>
          <h2>Bom ter você por aqui.</h2>
          <p>Entre para acessar seu espaço de trabalho.</p>
          <label>
            E-mail ou usuário
            <input
              name="email"
              type="text"
              autoComplete="username"
              required
              maxLength={254}
              placeholder="Seu e-mail ou usuário"
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={1}
              maxLength={128}
            />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="auth-submit" disabled={busy}>
            {busy ? "Aguarde…" : "Entrar no Klivo"}
          </button>
          <p className="auth-legal">
            Ao acessar, você concorda com os{" "}
            <a href="/termos.html">Termos de uso</a>. Consulte a{" "}
            <a href="/privacidade.html">Política de privacidade</a>.
          </p>
        </form>
        <small className="auth-foot">Klivo © 2026</small>
      </main>
    </div>
  );
}
