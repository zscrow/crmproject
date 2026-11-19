import { useState } from "react";
import App from "./App.jsx";
import { createCrmStore, initialState } from "./store.mjs";

const PREFIX = "klivo-demo-v1:";
export function demoStorage(storage) {
  return {
    getItem: (key) => storage.getItem(PREFIX + key),
    setItem: (key, value) => storage.setItem(PREFIX + key, value),
  };
}
export default function Demo() {
  const [store] = useState(() => {
    const storage = demoStorage(window.localStorage);
    const seed = initialState(storage);
    seed.profile = {
      name: "Administrador de testes",
      email: "teste@example.com",
      company: "Alovi · demonstração",
    };
    seed.team[0].name = "Administrador de testes";
    return createCrmStore({ storage, seed });
  });
  return (
    <>
      <div className="demo-banner" role="status">
        <b>Demonstração local · sem envios reais</b>
        <span>
          Dados fictícios neste navegador. Nenhuma conexão com a Meta.
        </span>
      </div>
      <App store={store} />
    </>
  );
}
