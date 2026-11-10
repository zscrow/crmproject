import { useEffect, useRef, useState } from "react";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
export default function PdfView({ blob, onPrintReady }) {
  const [pdf, setPdf] = useState(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    canvas = useRef(),
    container = useRef();
  useEffect(() => {
    let active = true,
      task;
    import("pdfjs-dist/legacy/build/pdf.mjs")
      .then(async (lib) => {
        lib.GlobalWorkerOptions.workerSrc = workerUrl;
        const data = new Uint8Array(await blob.arrayBuffer());
        if (!active) return;
        task = lib.getDocument({
          data,
          cMapUrl: "/pdf-assets/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf-assets/standard_fonts/",
          wasmUrl: "/pdf-assets/wasm/",
        });
        const doc = await task.promise;
        if (active) setPdf(doc);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      setPdf(null);
      task?.destroy().catch(() => {});
    };
  }, [blob]);
  useEffect(() => {
    if (!pdf) return;
    let active = true,
      render;
    pdf
      .getPage(page)
      .then((p) => {
        if (!active) return;
        const base = p.getViewport({ scale: 1 }),
          width = Math.max(240, (container.current?.clientWidth || 800) - 32),
          viewport = p.getViewport({
            scale: Math.min(width / base.width, 1.8) * zoom,
          }),
          ratio = window.devicePixelRatio || 1;
        const node = canvas.current;
        node.width = Math.floor(viewport.width * ratio);
        node.height = Math.floor(viewport.height * ratio);
        node.style.width = viewport.width + "px";
        node.style.height = viewport.height + "px";
        render = p.render({
          canvasContext: node.getContext("2d"),
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
        });
        return render.promise;
      })
      .catch((e) => {
        if (active && e.name !== "RenderingCancelledException")
          setError(e.message);
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, page, zoom]);
  useEffect(() => {
    if (!pdf) return;
    onPrintReady?.(async () => {
      const images = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i),
          viewport = p.getViewport({ scale: 1.5 }),
          node = document.createElement("canvas");
        node.width = viewport.width;
        node.height = viewport.height;
        await p.render({ canvasContext: node.getContext("2d"), viewport })
          .promise;
        images.push(node.toDataURL("image/png"));
      }
      return images;
    });
    return () => onPrintReady?.(null);
  }, [pdf, onPrintReady]);
  return (
    <div className="react-pdf" ref={container}>
      <div className="pdf-controls">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ←
        </button>
        <span>
          Página {page} de {pdf?.numPages || "…"}
        </span>
        <button
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => setPage((p) => p + 1)}
        >
          →
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>+</button>
      </div>
      {error ? (
        <p role="alert">Não foi possível exibir o PDF: {error}</p>
      ) : (
        <canvas ref={canvas} aria-label={`Página ${page} do PDF`} />
      )}
    </div>
  );
}
