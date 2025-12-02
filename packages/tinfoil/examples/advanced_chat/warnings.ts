/**
 * Installs a filter on process.emitWarning to suppress the noisy
 * "X25519 Web Crypto API" experimental warning unless explicitly enabled.
 *
 * Call this once at startup. If `TINFOIL_ENABLE_WARNINGS` is set to "true",
 * the filter will not be installed so you can see all Node warnings.
 */
export function installX25519WarningFilter(): void {
  if (process.env.TINFOIL_ENABLE_WARNINGS === "true") return;

  const originalEmitWarning = process.emitWarning as unknown as (
    warning: any,
    ...args: any[]
  ) => void;

  (process as any).emitWarning = function (warning: any, ...args: any[]) {
    const msg = typeof warning === "string" ? warning : warning?.message;
    if (msg && String(msg).includes("X25519 Web Crypto API")) {
      return;
    }
    return (originalEmitWarning as any).call(process, warning, ...args);
  };
}


