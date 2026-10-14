import { useSyncExternalStore } from "react";

/**
 * A single observable value held outside React. Effects that react to an
 * engine transition write here (an external system), and components read it
 * with useSyncExternalStore, which keeps renders free of cascading setState.
 */
export interface ValueStore<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useValueStore<T>(store: ValueStore<T>, serverValue: T): T {
  return useSyncExternalStore(store.subscribe, store.get, () => serverValue);
}

const noop = () => () => {};

/** A browser capability read once on the client, null during server rendering. */
export function useClientValue<T>(read: () => T): T | null {
  return useSyncExternalStore(noop, read, () => null);
}
