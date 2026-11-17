import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreContext, UiContext, useCrm, useUi } from "./context.jsx";
import Crm from "./domain/crm.mjs";
import { Icon, Avatar } from "./components/UI.jsx";
import Attendance from "./pages/Attendance.jsx";
import Contacts from "./pages/Contacts.jsx";
import Conversation from "./pages/Conversation.jsx";
import Templates from "./pages/Templates.jsx";
import Team from "./pages/Team.jsx";
import Logs from "./pages/Logs.jsx";
import Settings from "./pages/Settings.jsx";
import Reminders from "./pages/Reminders.jsx";
import DialogRouter from "./components/dialogs/DialogRouter.jsx";
import FileViewer from "./components/FileViewer.jsx";
import { AccountControls, useAuth } from "./Auth.jsx";
import {
  CloudControls,
  WorkspaceOnboarding,
  InboxLabel,
} from "./CloudWorkspace.jsx";

function UiProvider({ children }) {
  const { store } = useCrm();
  const [page, setPage] = useState("attendance"),
    [selected, setSelected] = useState(null),
    [dialog, setDialog] = useState(null),
    [viewer, setViewer] = useState(null),
    [conversationClosing, setConversationClosing] = useState(false),
    [toast, setToast] = useState("");
  const timer = useRef(),
    navigationTimer = useRef(),
    pendingPage = useRef(null),
    drafts = useRef({});
  const finishNavigation = useCallback(() => {
    if (pendingPage.current === null) return;
    clearTimeout(navigationTimer.current);
    setPage(pendingPage.current);
    pendingPage.current = null;
    setConversationClosing(false);
    window.scrollTo(0, 0);
  }, []);
  const notify = useCallback((message) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 3800);
  }, []);
  const openConversation = useCallback(
    (id) => {
      const s = store.getSnapshot(),
        actor = s.team.find((a) => a.id === s.activeAgentId);
      if (
        !Crm.canViewContact(
          actor,
          s.contacts.find((c) => c.id === id),
        )
      )
        return notify("Seu perfil não tem acesso a esse setor.");
      clearTimeout(navigationTimer.current);
      pendingPage.current = null;
      setConversationClosing(false);
      setSelected(id);
      setPage("conversation");
      setDialog(null);
      window.scrollTo(0, 0);
    },
    [store, notify],
  );
  const navigate = useCallback(
    (next) => {
      setDialog(null);
      const snapshot = store.getSnapshot();
      const actor = snapshot.team.find((a) => a.id === snapshot.activeAgentId);
      const contact = snapshot.contacts.find((c) => c.id === selected);
      if (
        page === "conversation" &&
        next !== "conversation" &&
        contact &&
        Crm.canViewContact(actor, contact) &&
        window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches
      ) {
        pendingPage.current = next;
        setConversationClosing(true);
        clearTimeout(navigationTimer.current);
        // Complete navigation even if the browser does not emit animationend.
        navigationTimer.current = setTimeout(finishNavigation, 350);
        return;
      }
      clearTimeout(navigationTimer.current);
      pendingPage.current = null;
      setConversationClosing(false);
      setPage(next);
      window.scrollTo(0, 0);
    },
    [page, selected, store, finishNavigation],
  );
  useEffect(() => {
    document.body.style.overflow = dialog || viewer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dialog, viewer]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(navigationTimer.current);
      for (const draft of Object.values(drafts.current))
        for (const file of draft.files || [])
          URL.revokeObjectURL(file.previewUrl);
    },
    [],
  );
  const value = {
    page,
    navigate,
    conversationClosing,
    finishNavigation,
    selected,
    setSelected,
    dialog,
    setDialog,
    viewer,
    setViewer,
    notify,
    openConversation,
    drafts,
  };
  return (
    <UiContext.Provider value={value}>
      {children}
      {toast && (
        <div id="toast" className="show" role="status">
          {toast}
        </div>
      )}
      <DialogRouter />
      {viewer && <FileViewer />}
    </UiContext.Provider>
  );
}
function Workspace() {
  const { state, actions, actor, visible, store } = useCrm(),
    ui = useUi();
  const session = useAuth();
  const admin = Crm.isAdmin(actor);
  const canLogs = Crm.capability(actor, "viewLogs");
  const items = [
    ["attendance", "Atendimentos", "chat"],
    ["contacts", "Clientes", "contacts"],
    ["templates", "Templates", "mail"],
    ["reminders", "Lembretes", "clock"],
    ...(admin ? [["team", "Equipe", "shield"]] : []),
    ...(canLogs ? [["logs", "Logs", "list"]] : []),
  ];
  useEffect(() => {
    ui.setDialog(null);
    ui.setViewer(null);
  }, [actor.id]);
  const titles = {
    attendance: "Atendimentos",
    conversation: "Conversas",
    contacts: "Clientes",
    templates: "Templates",
    team: "Equipe",
    logs: "Logs",
    settings: "Configurações",
  };
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);
  useEffect(() => {
    const tick = () => actions.expire();
    const id = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [actions]);
  useEffect(() => {
    if ((ui.page === "team" && !admin) || (ui.page === "logs" && !canLogs))
      ui.navigate("attendance");
    if (
      ui.page === "conversation" &&
      !visible.some((c) => c.id === ui.selected)
    )
      ui.navigate("attendance");
  }, [
    ui.page,
    ui.selected,
    actor.id,
    admin,
    canLogs,
    visible.map((c) => c.id).join(","),
  ]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            ui.navigate("attendance");
          }}
        >
          <span className="brand-icon">K</span>
          Klivo
        </a>
        <div className="workspace">
          <span className="workspace-logo">M</span>
          <span>
            <b>{state.profile.company}</b>
            <small>Área de trabalho</small>
          </span>
        </div>
        <div className="nav-label">ATENDIMENTO</div>
        <nav>
          {items.map(([page, label, icon]) => (
            <button
              key={page}
              className={`nav-item ${ui.page === page || (page === "attendance" && ui.page === "conversation") ? "active" : ""}`}
              aria-current={ui.page === page ? "page" : undefined}
              onClick={() => ui.navigate(page)}
            >
              <span>
                <Icon name={icon} />
              </span>
              <span className="nav-text">{label}</span>
            </button>
          ))}
          <div className="nav-label admin">GERENCIAR</div>
          <button
            className={`nav-item ${ui.page === "settings" ? "active" : ""}`}
            onClick={() => ui.navigate("settings")}
          >
            <span>
              <Icon name="settings" />
            </span>
            <span className="nav-text">Configurações</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="connection">
            <i />
            <b>WhatsApp Business</b>
            <small>
              <InboxLabel />
            </small>
          </div>
          <button className="user" onClick={() => ui.navigate("settings")}>
            <Avatar contact={{ name: actor.name, color: "blue" }} />
            <span>
              <b>{actor.name}</b>
              <small>{actor.role}</small>
            </span>
            <span>⌄</span>
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="breadcrumb">Minha empresa</span>
            <span className="slash">/</span>
            <b>{titles[ui.page] || "Lembretes"}</b>
          </div>
          <div className="top-actions">
            <CloudControls />
            <AccountControls />
            <button
              className="theme-toggle secondary"
              onClick={() =>
                actions.setTheme(state.theme === "dark" ? "light" : "dark")
              }
            >
              {state.theme === "dark" ? "☀ Tema claro" : "☾ Tema escuro"}
            </button>
            {!store.cloud && (
              <label className="agent-switcher">
                <span>Atendente · demo</span>
                <select
                  aria-label="Atendente em uso"
                  value={actor.id}
                  onChange={(e) => actions.setAgent(e.target.value)}
                >
                  {state.team.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>
        <div className="content" id="main-content" tabIndex={-1}>
          {store.cloud && session && (
            <WorkspaceOnboarding user={session.user} store={store} />
          )}
          {ui.page === "attendance" ? (
            <Attendance />
          ) : ui.page === "contacts" ? (
            <Contacts />
          ) : ui.page === "conversation" ? (
            <Conversation />
          ) : ui.page === "templates" ? (
            <Templates />
          ) : ui.page === "team" && admin ? (
            <Team />
          ) : ui.page === "logs" && canLogs ? (
            <Logs />
          ) : ui.page === "reminders" ? (
            <Reminders />
          ) : ui.page === "settings" ? (
            <Settings key={actor.id} />
          ) : (
            <Attendance />
          )}
        </div>
        <footer>
          Feito para aproximar pessoas.<span>Klivo © 2026</span>
        </footer>
      </main>
    </>
  );
}
export default function App({ store }) {
  return (
    <StoreContext.Provider value={store}>
      <UiProvider>
        <Workspace />
      </UiProvider>
    </StoreContext.Provider>
  );
}
