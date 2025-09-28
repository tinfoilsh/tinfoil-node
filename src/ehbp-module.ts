import { isRealBrowser } from "./env";

// Centralized loader for the ESM-only `ehbp` module and related helpers.
// This mirrors the dynamic import strategy used elsewhere to support both
// browser builds and Node.js CJS test environments.

export type EhbpModule = typeof import("ehbp");

let ehbpModulePromise: Promise<EhbpModule> | null = null;
let ehbpModuleOverride: EhbpModule | undefined;

export function getEhbpModule(): Promise<EhbpModule> {
  if (ehbpModuleOverride) {
    return Promise.resolve(ehbpModuleOverride);
  }
  if (!ehbpModulePromise) {
    if (isRealBrowser()) {
      // Let the bundler include the module in browser builds
      ehbpModulePromise = import("ehbp");
    } else {
      const dynamicImport = new Function(
        "specifier",
        "return import(specifier);",
      ) as (specifier: string) => Promise<EhbpModule>;
      ehbpModulePromise = dynamicImport("ehbp");
    }
  }
  return ehbpModulePromise;
}

export function ensureEhbpEnvironment(): void {
  if (typeof globalThis !== "undefined") {
    const isSecure = (globalThis as any).isSecureContext !== false;
    const hasSubtle = !!(globalThis.crypto && (globalThis.crypto as Crypto).subtle);
    if (!isSecure || !hasSubtle) {
      const reason = !isSecure
        ? "insecure context (use HTTPS or localhost)"
        : "missing WebCrypto SubtleCrypto";
      throw new Error(`EHBP requires a secure browser context: ${reason}`);
    }
  }
}

// Test utilities to allow module substitution in unit tests
export function __setEhbpModuleForTests(module: EhbpModule | undefined): void {
  ehbpModuleOverride = module;
  ehbpModulePromise = module ? Promise.resolve(module) : null;
}

export function __resetEhbpModuleStateForTests(): void {
  ehbpModuleOverride = undefined;
  ehbpModulePromise = null;
}

