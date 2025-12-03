// Re-export everything from verifier-node for Node.js environments
export * from '@tinfoil/verifier-node';

// No-op function for backwards compatibility (WASM is no longer used)
export function suppressWasmLogs(_suppress = true): void {
  // No-op - WASM is no longer used
}
