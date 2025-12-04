import fs from "node:fs";
import path from "node:path";
import { parse as dotenvParse } from "dotenv";

/**
 * Loads environment variables from .env quietly (no banners/logs).
 * Only sets values that are currently undefined in process.env.
 */
export function loadEnvQuietly(): void {
  try {
    const envPath = process.env.DOTENV_CONFIG_PATH || path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const parsed = dotenvParse(fs.readFileSync(envPath));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v as string;
      }
    }
  } catch {
    // best-effort only
  }
}


