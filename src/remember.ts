// What one phone remembers between visits: which cards are open and which sessions are hidden.
// The browser may keep nothing (a private window, blocked storage); the page then simply forgets.

export interface Keep {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function recall<T>(keep: Keep | undefined, key: string, empty: T): T {
  try {
    const raw = keep?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : empty;
  } catch {
    return empty;
  }
}

export function remember(keep: Keep | undefined, key: string, value: unknown): void {
  try {
    keep?.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing is kept; the choice still holds until the page closes.
  }
}

/** The browser's own storage, or nothing when even asking for it fails. */
export function browserKeep(): Keep | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
