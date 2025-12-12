// Simple ANSI color helpers (no external deps)
export const fmt = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
};

// Small icon helper for step statuses used in the verification UI
export function statusIcon(status: "pending" | "loading" | "success" | "error"): string {
  switch (status) {
    case "pending":
      return fmt.gray("○");
    case "loading":
      return fmt.cyan("…");
    case "success":
      return fmt.green("✓");
    case "error":
      return fmt.red("✗");
  }
}

// Utility to shorten long strings for compact inline displays
export function truncate(value: string, max = 48): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}


