/**
 * Detects if the code is running in a real browser environment.
 * Returns false for Node.js environments, even with WASM loaded.
 */
export function isRealBrowser(): boolean {
  if (
    typeof process !== "undefined" &&
    (process as any).versions &&
    (process as any).versions.node
  ) {
    return false;
  }

  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    if (typeof navigator !== "undefined" && navigator.userAgent) {
      return true;
    }
  }

  return false;
}


