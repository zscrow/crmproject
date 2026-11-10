import { useEffect, useState } from "react";
import Session from "../domain/session.mjs";
import { useUi } from "../context.jsx";
import { assetUrl } from "../services/media.mjs";
import { bytes } from "../services/format.mjs";
import { Icon } from "./UI.jsx";
export function useAssetUrl(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    assetUrl(id)
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return url;
}
function Attachment({ attachment: a, contactId, sender }) {
  const url = useAssetUrl(a.mediaId),
    ui = useUi();
  const open = () => ui.setViewer({ contactId, mediaId: a.mediaId });
  if (a.kind === "audio")
    return (
      <div className="message-attachment voice-message">
        <div className="voice-message-label">
          <Icon name="mic" />
          Mensagem de voz
        </div>
        <audio
          controls
          preload="metadata"
          src={url || undefined}
          aria-label={`Mensagem de voz de ${sender}`}
        />
        <button className="media-secondary" onClick={open}>
          Abrir áudio
        </button>
      </div>
    );
  if (a.kind === "image" || a.kind === "sticker")
    return (
      <div className="message-attachment">
        <button
          className="media-image-button"
          aria-label={`Abrir imagem ${a.name}`}
          onClick={open}
        >
          {url ? (
            <img
              src={url}
              alt={a.name}
              className={
                a.kind === "sticker" ? "sticker-preview" : "message-image"
              }
            />
          ) : (
            <span>Carregando imagem…</span>
          )}
        </button>
      </div>
    );
  if (a.kind === "video")
    return (
      <div className="message-attachment">
        <video controls preload="metadata" src={url || undefined} />
        <button className="media-file-button" onClick={open}>
          Abrir vídeo <Icon name="arrow" />
        </button>
      </div>
    );
  return (
    <div className="message-attachment">
      <button className="media-file-button" onClick={open}>
        <Icon name="download" />
        <span>
          {a.name}
          <small>{bytes(a.size)}</small>
        </span>
        <b>Abrir</b>
      </button>
    </div>
  );
}
export default function Message({ message, contactId, messageId, onReply }) {
  const m = Session.normalize(message);
  if (m.direction === "system")
    return <div className="conversation-event">{m.text}</div>;
  const attachments = m.attachments || [];
  let text = m.text || "";
  if (
    attachments.some((a) => text === a.name) ||
    text === "[" + attachments.map((a) => a.name).join(", ") + "]"
  )
    text = "";
  return (
    <article
      id={`message-${contactId}-${messageId || m.id}`}
      className={`message-bubble ${m.direction === "outbound" ? "sent" : "received"}`}
    >
      <div className="message-author">
        {m.senderName || "Atendente não registrado"}
        <time>
          {m.createdAt
            ? new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Registro anterior"}
        </time>
      </div>
      {onReply && (
        <button
          className="reply-message-button"
          aria-label={`Responder citando mensagem de ${m.senderName || "atendente"}`}
          title="Responder citando"
          onClick={onReply}
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 5-6 6 6 6M3 11h10a7 7 0 0 1 7 7" />
          </svg>
        </button>
      )}
      {m.replyTo && (
        <button
          className="quoted-message"
          aria-label="Ver mensagem citada"
          onClick={() => {
            const node = document.getElementById(
              `message-${contactId}-${m.replyTo.messageId}`,
            );
            node?.scrollIntoView({ behavior: "smooth", block: "center" });
            node?.animate?.(
              [
                { outline: "2px solid #84baff" },
                { outline: "2px solid transparent" },
              ],
              { duration: 1600 },
            );
          }}
        >
          <b>{m.replyTo.senderName}</b>
          <span>{m.replyTo.text}</span>
        </button>
      )}
      {m.type === "template" && (
        <div className="template-message-label">
          Modelo WhatsApp · simulação
        </div>
      )}
      {text && <p>{text}</p>}
      {attachments.map((a) => (
        <Attachment
          key={a.mediaId}
          attachment={a}
          contactId={contactId}
          sender={m.senderName}
        />
      ))}
    </article>
  );
}
