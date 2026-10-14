/** Browser preferences are optional: some browsers deny access to storage entirely. */
export function getBrowserStorageItem(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setBrowserStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    // Keep the current preference for this visit even if it cannot be saved.
  }
}
