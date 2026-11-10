import { useEffect, useRef, useState } from "react";
import { useCrm, useUi, useNow } from "../context.jsx";
import { commandSuggestions } from "../services/chat.mjs";
import Crm from "../domain/crm.mjs";
import Session from "../domain/session.mjs";
import { Icon } from "./UI.jsx";
import { createRecorder } from "../services/recorder.mjs";
import { persistAttachments } from "../services/media.mjs";
const EMOJIS = [
  "😀",
  "😊",
  "😉",
  "😍",
  "😎",
  "🤔",
  "😅",
  "😂",
  "😢",
  "🙏",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🤝",
  "💪",
  "❤️",
  "💙",
  "⭐",
  "✨",
  "🎉",
  "✅",
  "❌",
  "⚠️",
  "📌",
  "📎",
  "📦",
  "🖨️",
  "🎨",
  "💰",
  "💳",
  "📅",
  "🕒",
  "☎️",
  "📍",
  "🚀",
  "👋",
];
export default function Composer({ contact: c, reply, onCancelReply }) {
  const { state, actor, actions, store } = useCrm(),
    ui = useUi();
  const initial = ui.drafts.current[c.id] || {};
  const [text, setText] = useState(initial.text || ""),
    [files, setFiles] = useState(initial.files || []),
    [commands, setCommands] = useState(null),
    [commandIndex, setCommandIndex] = useState(0),
    [menu, setMenu] = useState(null),
    [recording, setRecording] = useState(null),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  const input = useRef(),
    fileInput = useRef(),
    root = useRef(),
    latest = useRef();
  const [now, setNow] = useState(Date.now());
  latest.current = { actor, c, ui, files, text };
  const updateFiles = (fn) =>
    setFiles((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      ui.drafts.current[c.id] = { text: latest.current.text, files: next };
      return next;
    });
  const recorder = useRef(null);
  useEffect(() => {
    const controller = createRecorder({
      onChange: setRecording,
      onDraft: (clip) => {
        const item = { ...clip, previewUrl: URL.createObjectURL(clip.blob) };
        updateFiles((items) => [...items, item]);
      },
      onError: (error) => ui.notify(error.message),
    });
    recorder.current = controller;
    return () => {
      controller.dispose();
      recorder.current = null;
    };
  }, [c.id, actor.id]);
  useEffect(() => {
    if (ui.dialog || ui.viewer) recorder.current?.stop(false);
  }, [ui.dialog, ui.viewer]);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [recording]);
  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height =
        Math.min(160, Math.max(42, input.current.scrollHeight)) + "px";
    }
  }, [text, files.length]);
  useEffect(() => {
    function outside(e) {
      if (!root.current?.contains(e.target)) {
        setMenu(null);
        setCommands(null);
      }
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function change(value, caret) {
    const expansion = Crm.expand(value, caret, state.quickReplies, {
      nome: c.name,
      atendente: actor.name,
      empresa: state.profile.company,
    });
    setFeedback("");
    if (expansion?.missing.length)
      setFeedback(
        `Configure /${expansion.template.shortcut} na aba Templates: ${expansion.missing.join(", ")}.`,
      );
    else if (expansion) {
      value = expansion.text;
      requestAnimationFrame(() =>
        input.current?.setSelectionRange(expansion.caret, expansion.caret),
      );
    }
    setText(value);
    ui.drafts.current[c.id] = { text: value, files };
    setCommands(
      expansion && !expansion.missing.length
        ? null
        : commandSuggestions(value, caret, state.quickReplies),
    );
    setCommandIndex(0);
  }
  function chooseCommand(template) {
    if (!commands) return;
    const token = "/" + template.shortcut;
    change(
      text.slice(0, commands.start) + token + text.slice(commands.end),
      commands.start + token.length,
    );
    setCommands(null);
    input.current?.focus();
  }
  useEffect(() => {
    if (reply) input.current?.focus();
  }, [reply]);
  function own() {
    if (!Session.canReply(c) || c.sessionState !== "open") {
      ui.notify("A janela terminou. Use um modelo aprovado.");
      return false;
    }
    if (c.assigneeId && c.assigneeId !== actor.id) {
      ui.notify("Assuma o atendimento antes de responder.");
      return false;
    }
    return true;
  }
  async function selectFiles(list) {
    if (!own()) return;
    const prepared = [];
    for (const file of list) {
      if (file.size > 25 * 1024 * 1024) {
        ui.notify("Na prévia, o limite por arquivo é 25 MB.");
        continue;
      }
      prepared.push({
        blob: file,
        name: file.name,
        kind: file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("audio/")
            ? "audio"
            : file.type.startsWith("video/")
              ? "video"
              : "document",
        previewUrl: URL.createObjectURL(file),
      });
    }
    updateFiles((items) => [...items, ...prepared]);
  }
  async function send(e) {
    e.preventDefault();
    if (busy || !own()) return;
    if (/^\/[\p{L}\p{N}_]+$/iu.test(text.trim()))
      return ui.notify("Configure esse atalho na aba Templates.");
    if (!text.trim() && !files.length) return;
    const sender = actor.id;
    setBusy(true);
    try {
      const attachments = await persistAttachments(files);
      actions.send(c.id, text, attachments, sender, reply?.messageId);
      onCancelReply?.();
      setCommands(null);
      setText("");
      for (const f of files) URL.revokeObjectURL(f.previewUrl);
      updateFiles([]);
      ui.drafts.current[c.id] = { text: "", files: [] };
      input.current?.focus();
    } catch (error) {
      ui.notify(error.message);
    } finally {
      setBusy(false);
    }
  }
  function emoji(value) {
    const start = input.current.selectionStart ?? text.length,
      end = input.current.selectionEnd ?? start;
    const next = text.slice(0, start) + value + text.slice(end);
    setText(next);
    ui.drafts.current[c.id] = { text: next, files };
    input.current.focus();
    requestAnimationFrame(() =>
      input.current?.setSelectionRange(
        start + value.length,
        start + value.length,
      ),
    );
  }
  return (
    <form
      className="signed-composer compact-composer"
      onSubmit={send}
      ref={root}
    >
      {reply && (
        <div
          className="reply-preview"
          role="region"
          aria-label="Respondendo à mensagem"
        >
          <div>
            <small>Respondendo a {reply.senderName}</small>
            <p>{reply.text}</p>
          </div>
          <button
            type="button"
            aria-label="Cancelar resposta citada"
            onClick={onCancelReply}
          >
            ×
          </button>
        </div>
      )}
      {commands && (
        <div className="command-suggestions">
          <header>
            <b>Atalhos de templates</b>
            <small>↑ ↓ para escolher · Enter para inserir</small>
          </header>
          <div
            role="listbox"
            id={`commands-${c.id}`}
            aria-label="Comandos disponíveis"
          >
            {commands.items.map((t, i) => (
              <button
                type="button"
                role="option"
                id={`command-${c.id}-${i}`}
                aria-selected={commandIndex === i}
                key={t.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => chooseCommand(t)}
              >
                <b>/{t.shortcut}</b>
                <span>
                  {t.title}
                  <small>{t.body}</small>
                </span>
              </button>
            ))}
          </div>
          {!commands.items.length && (
            <p>Nenhum atalho encontrado. Cadastre na aba Templates.</p>
          )}
        </div>
      )}
      {files.length > 0 && (
        <div className="attachment-drafts">
          {files.map((f, i) => (
            <div className="attachment-draft" key={f.previewUrl}>
              {f.kind === "audio" ? (
                <div className="voice-draft">
                  <span>Mensagem de voz</span>
                  <audio controls src={f.previewUrl} />
                </div>
              ) : f.kind === "image" ? (
                <>
                  <img src={f.previewUrl} alt={`Prévia de ${f.name}`} />
                  <span>
                    <b>{f.name}</b>
                  </span>
                </>
              ) : (
                <>
                  <Icon name="download" />
                  <b>{f.name}</b>
                </>
              )}
              <button
                type="button"
                aria-label={
                  f.kind === "audio" ? "Remover áudio" : `Remover ${f.name}`
                }
                onClick={() => {
                  URL.revokeObjectURL(f.previewUrl);
                  updateFiles((items) =>
                    items.filter((_, index) => index !== i),
                  );
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {recording && (
        <div className="compact-voice-recording">
          <i className="recording-pulse" />
          <span>Gravando</span>
          <time>{Math.floor((now - recording.startedAt) / 1000)}s</time>
          <button
            type="button"
            aria-label="Descartar gravação"
            onClick={() => recorder.current?.stop(true)}
          >
            <Icon name="close" />
          </button>
          <button
            type="button"
            aria-label="Parar e revisar áudio"
            onClick={() => recorder.current?.stop(false)}
          >
            <Icon name="stop" />
          </button>
        </div>
      )}
      <div className="compact-compose-row">
        <div className="composer-accessories">
          <button
            type="button"
            className="composer-icon"
            aria-label="Adicionar anexo"
            aria-expanded={menu === "file"}
            onClick={() => setMenu(menu === "file" ? null : "file")}
          >
            <Icon name="plus" />
          </button>
          <button
            type="button"
            className="composer-icon"
            aria-label="Escolher emoji"
            aria-expanded={menu === "emoji"}
            onClick={() => setMenu(menu === "emoji" ? null : "emoji")}
          >
            <Icon name="smile" />
          </button>
        </div>
        <textarea
          ref={input}
          id="signed-message"
          aria-label="Mensagem"
          aria-autocomplete="list"
          aria-expanded={!!commands}
          aria-controls={commands ? `commands-${c.id}` : undefined}
          aria-activedescendant={
            commands?.items.length
              ? `command-${c.id}-${commandIndex}`
              : undefined
          }
          onClick={(e) => {
            setCommands(
              commandSuggestions(
                text,
                e.currentTarget.selectionStart,
                state.quickReplies,
              ),
            );
            setCommandIndex(0);
          }}
          name="text"
          rows={1}
          required={!files.length}
          placeholder="Mensagem"
          value={text}
          onChange={(e) => change(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (commands) {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setCommands(null);
                return;
              }
              if (commands.items.length) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setCommandIndex(
                    (i) =>
                      (i +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        commands.items.length) %
                      commands.items.length,
                  );
                  return;
                }
                if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                  e.preventDefault();
                  chooseCommand(
                    commands.items[commandIndex] || commands.items[0],
                  );
                  return;
                }
              }
            }
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              e.currentTarget.form.requestSubmit();
            }
          }}
        />
        <button
          type="button"
          className="composer-icon microphone-button"
          aria-label="Gravar áudio"
          disabled={!!recording || busy}
          onClick={() => {
            if (own()) recorder.current?.start();
          }}
        >
          <Icon name="mic" />
        </button>
        <button
          className="primary composer-send"
          type="submit"
          aria-label={busy ? "Registrando mensagem" : "Enviar mensagem"}
          disabled={busy || !!(c.assigneeId && c.assigneeId !== actor.id)}
        >
          {busy ? <span className="send-spinner" /> : <Icon name="send" />}
        </button>
      </div>
      {menu === "file" && (
        <div className="attachment-menu">
          {[
            ["visual", "Fotos e vídeos", "image/*,video/*"],
            ["file", "Documento", ""],
            ["audio", "Arquivo de áudio", "audio/*"],
          ].map(([kind, label, accept]) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                if (!own()) return;
                fileInput.current.accept = accept;
                fileInput.current.value = "";
                fileInput.current.click();
                setMenu(null);
              }}
            >
              <Icon
                name={
                  kind === "audio"
                    ? "mic"
                    : kind === "file"
                      ? "download"
                      : "contacts"
                }
              />
              {label}
            </button>
          ))}
        </div>
      )}
      {menu === "emoji" && (
        <div className="emoji-menu">
          <div className="emoji-menu-heading">
            <b>Emojis</b>
            <button
              type="button"
              aria-label="Fechar emojis"
              onClick={() => setMenu(null)}
            >
              ×
            </button>
          </div>
          <div>
            {EMOJIS.map((value) => (
              <button
                type="button"
                key={value}
                aria-label={value}
                onClick={() => emoji(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}
      {feedback && (
        <div className="shortcut-feedback" role="status">
          {feedback}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => selectFiles([...e.target.files])}
      />
    </form>
  );
}
