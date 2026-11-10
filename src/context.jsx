import {
  createContext,
  useContext,
  useSyncExternalStore,
  useEffect,
  useState,
} from "react";
import { actorOf, visibleContacts } from "./store.mjs";
export const StoreContext = createContext(null);
export const UiContext = createContext(null);
export function useCrm() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("CRMProvider ausente");
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return {
    state,
    actions: store.actions,
    store,
    actor: actorOf(state),
    visible: visibleContacts(state),
  };
}
export function useUi() {
  return useContext(UiContext);
}
export function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
