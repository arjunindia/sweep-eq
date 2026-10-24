import { useSyncExternalStore } from "react";
import { store, type AppState } from "../lib/store.ts";

const subscribe = (cb: () => void) => store.subscribe(cb);

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, store.get, store.get);
}

// Subscribe to one slice of state. The component re-renders only when the
// selected value changes (Object.is), so a frequency sweep no longer
// re-renders screens and chrome that don't display the frequency.
//
// Selectors must return primitives or object references that live in the
// state itself (e.g. `s.bands`) — never a freshly built object — otherwise
// React sees a new snapshot on every read.
export function useStoreSelector<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(store.get()),
    () => selector(store.get())
  );
}
