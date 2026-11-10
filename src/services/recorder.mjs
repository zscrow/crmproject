/** Encapsulates microphone lifetime independently of React rendering. */
export function createRecorder({
  getUserMedia = (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  Recorder = globalThis.MediaRecorder,
  onChange = () => {},
  onDraft = () => {},
  onError = () => {},
  maxDuration = 300000,
} = {}) {
  let current = null,
    pending = false,
    disposed = false;
  let generation = 0;
  async function start() {
    if (current || pending || disposed) return;
    const token = ++generation;
    pending = true;
    let stream;
    try {
      if (!Recorder)
        throw new Error(
          "Seu navegador não oferece gravação. Anexe um arquivo de áudio.",
        );
      stream = await getUserMedia({ audio: true });
      if (disposed || token !== generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const type = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/webm",
      ].find((t) => Recorder.isTypeSupported?.(t));
      const recorder = new Recorder(
          stream,
          type ? { mimeType: type } : undefined,
        ),
        state = {
          recorder,
          stream,
          chunks: [],
          cancelled: false,
          startedAt: Date.now(),
          timer: null,
        };
      current = state;
      recorder.ondataavailable = (e) => {
        if (e.data.size) state.chunks.push(e.data);
      };
      const release = () => {
        clearTimeout(state.timer);
        stream.getTracks().forEach((t) => t.stop());
        if (current === state) current = null;
        onChange(null);
      };
      recorder.onstop = () => {
        release();
        if (!state.cancelled && state.chunks.length) {
          const blob = new Blob(state.chunks, {
            type: recorder.mimeType || "audio/webm",
          });
          onDraft({
            blob,
            name:
              "audio-" +
              Date.now() +
              (blob.type.includes("ogg") ? ".ogg" : ".webm"),
            kind: "audio",
          });
        }
      };
      recorder.onerror = () => {
        state.cancelled = true;
        if (recorder.state !== "inactive") recorder.stop();
        release();
        onError(new Error("Não foi possível concluir a gravação."));
      };
      recorder.start();
      state.timer = setTimeout(() => stop(false), maxDuration);
      onChange({ startedAt: state.startedAt });
    } catch (error) {
      if (current) {
        clearTimeout(current.timer);
        current = null;
        onChange(null);
      }
      stream?.getTracks().forEach((t) => t.stop());
      if (!disposed)
        onError(
          error.name === "NotAllowedError"
            ? new Error("Permita o microfone no navegador para gravar.")
            : error,
        );
    } finally {
      if (token === generation) pending = false;
    }
  }
  function stop(cancel = false) {
    if (pending) {
      generation++;
      pending = false;
    }
    const state = current;
    if (!state) return;
    state.cancelled = cancel;
    if (state.recorder.state !== "inactive") state.recorder.stop();
    state.stream.getTracks().forEach((t) => t.stop());
  }
  return {
    start,
    stop,
    dispose() {
      disposed = true;
      generation++;
      stop(true);
    },
    getState: () => (current ? { startedAt: current.startedAt } : null),
  };
}
