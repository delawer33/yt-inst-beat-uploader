import { useCallback, useEffect, useState } from "react";
import { FILTER_IDS, SORT_IDS, VIEW_IDS, type Filter, type Sort, type View } from "./filters";

/** What the toolbar is set to. Kept in localStorage so a reload looks the same. */
export type Prefs = { filter: Filter; sort: Sort; view: View };

export const PREFS_KEY = "beat-upload.library";

export const DEFAULT_PREFS: Prefs = { filter: "all", sort: "newest", view: "grid" };

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Pure and forgiving: anything unreadable or unknown falls back to the default. */
export function parsePrefs(raw: string | null): Prefs {
  if (raw === null) return DEFAULT_PREFS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFS;
  }
  if (value === null || typeof value !== "object") return DEFAULT_PREFS;
  const stored = value as Partial<Record<keyof Prefs, unknown>>;
  return {
    filter: pick(stored.filter, FILTER_IDS, DEFAULT_PREFS.filter),
    sort: pick(stored.sort, SORT_IDS, DEFAULT_PREFS.sort),
    view: pick(stored.view, VIEW_IDS, DEFAULT_PREFS.view),
  };
}

function read(): Prefs {
  try {
    return parsePrefs(window.localStorage.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(read);
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // A browser with storage switched off still gets a working toolbar.
    }
  }, [prefs]);
  const update = useCallback(
    (patch: Partial<Prefs>) => setPrefs((current) => ({ ...current, ...patch })),
    [],
  );
  return [prefs, update];
}
