"use client";

/**
 * A tiny external store over localStorage, read with useSyncExternalStore.
 *
 * The server snapshot is null, so nothing that depends on local records is
 * rendered during server rendering; components show a neutral placeholder
 * until the browser has read storage. Writes that fail (private browsing,
 * quota, storage disabled) keep working in memory for the session.
 */
import { useSyncExternalStore } from "react";
import { utcDateKey } from "@/lib/game/daily";
import { STORAGE_KEY, defaultData, loadData, type Settings, type StoredData } from "./schema";

type Listener = () => void;

let cache: StoredData | null = null;
const listeners = new Set<Listener>();
let persistent = true;

function makeId(): string {
  return globalThis.crypto.randomUUID();
}

function read(): StoredData {
  if (cache) return cache;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    persistent = false;
  }
  cache = loadData(raw, makeId, utcDateKey(new Date()));
  write(cache);
  return cache;
}

function write(data: StoredData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    persistent = true;
  } catch {
    persistent = false;
  }
}

function emit(): void {
  for (const l of listeners) l();
}

export function getData(): StoredData {
  return read();
}

export function updateData(fn: (data: StoredData) => StoredData): StoredData {
  const nextData = fn(read());
  cache = nextData;
  write(nextData);
  applyDocumentPreferences(nextData.settings);
  emit();
  return nextData;
}

export function updateSettings(patch: Partial<Settings>): void {
  updateData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
}

export function resetAllData(): void {
  updateData((d) => defaultData(d.playerId));
}

export function isStoragePersistent(): boolean {
  return persistent;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = (): StoredData | null => null;

/** Local records, or null before the browser has read storage. */
export function useStoredData(): StoredData | null {
  return useSyncExternalStore(subscribe, read, getServerSnapshot);
}

/** Mirror theme and motion preferences onto <html> so CSS can honour them. */
export function applyDocumentPreferences(settings: Settings): void {
  const root = document.documentElement;
  if (settings.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);
  if (settings.motion === "system") root.removeAttribute("data-motion");
  else root.setAttribute("data-motion", settings.motion);
}
