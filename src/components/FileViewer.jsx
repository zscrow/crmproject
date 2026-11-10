import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useCrm, useUi } from "../context.jsx";
import { readAsset, assetUrl } from "../services/media.mjs";
import { bytes, download } from "../services/format.mjs";
const PdfView = lazy(() => import("./PdfView.jsx"));
export default function FileViewer() {
  const { state, visible } = useCrm(),
    ui = useUi(),
    v = ui.viewer;
  const files = (state.messages[v.contactId] || []).flatMap(
      (m) => m.attachments || [],
    ),
    index = files.findIndex((a) => a.mediaId === v.mediaId),
    a = files[index];
  const [asset, setAsset] = useState(null),
    [error, setError] = useState(""),
    [printing, setPrinting] = useState(false),
    [text, setText] = useState("");
  const printPdf = useRef(null),
    setPrint = useCallback((fn) => {
      printPdf.current = fn;
    }, []),
    trigger = useRef(document.activeElement);
  const close = () => ui.setViewer(null);
  useEffect(() => {
    let active = true;
    setAsset(null);
    setError("");
    printPdf.current = null;
    if (!a) return;
    Promise.all([readAsset(a.mediaId), assetUrl(a.mediaId)])
      .then(async ([blob, url]) => {
        if (!blob) throw new Error("Arquivo indisponível neste navegador.");
        if (active) {
          setAsset({ blob, url });
          if (blob.type.startsWith("text/"))
            setText((await blob.text()).slice(0, 100000));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [a?.mediaId]);
  useEffect(() => {
    const keys = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll(
            ".react-viewer button,.react-viewer audio,.react-viewer video",
          ),
        ].filter((n) => !n.disabled);
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
      if (e.key === "ArrowLeft" && index > 0)
        ui.setViewer({ ...v, mediaId: files[index - 1].mediaId });
      if (e.key === "ArrowRight" && index < files.length - 1)
        ui.setViewer({ ...v, mediaId: files[index + 1].mediaId });
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [index, v]);
  useEffect(() => {
    document.querySelector(".react-viewer-close")?.focus();
    return () => trigger.current?.isConnected && trigger.current.focus();
  }, []);
  if (!visible.some((c) => c.id === v.contactId) || !a) return null;
  const pdf =
    a.mime === "application/pdf" || a.name?.toLowerCase().endsWith(".pdf");
  const print = async () => {
    try {
      setPrinting(true);
      const images = pdf ? await printPdf.current?.() : [asset.url];
      if (!images?.length) throw new Error("Aguarde o arquivo carregar.");
      const frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;width:0;height:0;border:0";
      document.body.append(frame);
      const doc = frame.contentDocument;
      doc.open();
      doc.write(
        "<html><head><title>Imprimir arquivo</title><style>body{margin:0}img{width:100%;height:auto;page-break-after:always}img:last-child{page-break-after:auto}</style></head><body></body></html>",
      );
      doc.close();
      await Promise.all(
        images.map(
          (src) =>
            new Promise((resolve) => {
              const image = doc.createElement("img");
              image.onload = resolve;
              image.onerror = resolve;
              image.src = src;
              doc.body.append(image);
            }),
        ),
      );
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60000);
    } catch (e) {
      ui.notify(e.message);
    } finally {
      setPrinting(false);
    }
  };
  return createPortal(
    <div
      className="react-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de arquivos"
    >
      <header>
        <div>
          <b>{a.kind === "audio" ? "Mensagem de voz" : a.name}</b>
          <small>
            {bytes(a.size)} · {index + 1} de {files.length}
          </small>
        </div>
        <button
          className="secondary"
          disabled={!asset}
          onClick={() => download(asset.blob, a.name)}
        >
          Baixar
        </button>
        {(pdf || a.kind === "image") && (
          <button
            className="secondary"
            disabled={!asset || printing}
            onClick={print}
          >
            {printing ? "Preparando…" : "Imprimir"}
          </button>
        )}
        <button className="secondary react-viewer-close" onClick={close}>
          Fechar ×
        </button>
      </header>
      <div className="react-viewer-body">
        <aside>
          {files.map((f, i) => (
            <button
              className={i === index ? "active" : ""}
              key={f.mediaId}
              onClick={() => ui.setViewer({ ...v, mediaId: f.mediaId })}
            >
              {f.kind === "audio" ? "Mensagem de voz" : f.name}
            </button>
          ))}
        </aside>
        <section>
          {error ? (
            <p role="alert">{error}</p>
          ) : !asset ? (
            <p>Carregando arquivo…</p>
          ) : pdf ? (
            <Suspense fallback={<p>Carregando PDF…</p>}>
              <PdfView
                key={a.mediaId}
                blob={asset.blob}
                onPrintReady={setPrint}
              />
            </Suspense>
          ) : a.kind === "image" || a.kind === "sticker" ? (
            <img src={asset.url} alt={a.name} />
          ) : a.kind === "audio" ? (
            <audio controls autoPlay src={asset.url} />
          ) : a.kind === "video" ? (
            <video controls src={asset.url} />
          ) : asset.blob.type.startsWith("text/") ? (
            <pre>{text}</pre>
          ) : (
            <div>
              <p>Prévia indisponível para este formato.</p>
              <button
                className="primary"
                onClick={() => download(asset.blob, a.name)}
              >
                Baixar arquivo
              </button>
            </div>
          )}
        </section>
      </div>
      <footer>
        <button
          className="secondary"
          disabled={index <= 0}
          onClick={() =>
            ui.setViewer({ ...v, mediaId: files[index - 1].mediaId })
          }
        >
          ← Anterior
        </button>
        <span>
          {index + 1} / {files.length}
        </span>
        <button
          className="secondary"
          disabled={index >= files.length - 1}
          onClick={() =>
            ui.setViewer({ ...v, mediaId: files[index + 1].mediaId })
          }
        >
          Próximo →
        </button>
      </footer>
    </div>,
    document.body,
  );
}
