export * from '@tinfoil/verifier-browser';

export function suppressWasmLogs(_suppress = true): void {
  // No-op in browser - there is no WASM
}
