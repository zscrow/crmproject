import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
const CloseContext = createContext();
export function ModalClose({ children = "Cancelar" }) {
  const close = useContext(CloseContext);
  return (
    <button type="button" className="secondary" onClick={close}>
      {children}
    </button>
  );
}
export default function Modal({ title, children, onClose, dirty = false }) {
  const ref = useRef(null),
    trigger = useRef(document.activeElement),
    [guard, setGuard] = useState(false);
  const requestClose = () => (dirty ? setGuard(true) : onClose());
  useEffect(() => {
    ref.current?.querySelector("input,textarea,select,button")?.focus();
    return () => {
      if (trigger.current?.isConnected) trigger.current.focus();
    };
  }, []);
  useEffect(() => {
    function keys(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
      if (e.key === "Tab") {
        const items = [
          ...ref.current.querySelectorAll(
            "button,input,textarea,select,a[href]",
          ),
        ].filter((n) => !n.disabled && n.getClientRects().length);
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [dirty, onClose]);
  return createPortal(
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title || "Formulário"}
        ref={ref}
      >
        <button className="close" aria-label="Fechar" onClick={requestClose}>
          ×
        </button>
        {title && <h2>{title}</h2>}
        <CloseContext.Provider value={requestClose}>
          {children}
        </CloseContext.Provider>
        {guard && (
          <div className="unsaved-guard" role="alert">
            <b>Você tem alterações não salvas.</b>
            <p>Continue editando ou descarte essas alterações.</p>
            <div>
              <button className="primary" onClick={() => setGuard(false)}>
                Continuar editando
              </button>
              <button className="secondary" onClick={onClose}>
                Descartar e fechar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
