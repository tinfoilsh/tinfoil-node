/// <reference types="vitest" />
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["src/__tests__/*.browser.test.ts"],
    exclude: ["src/__tests__/*.browser.integration.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
  resolve: {
    alias: {
      'tinfoil/secure-fetch': resolve(__dirname, 'src/secure-fetch.browser.ts'),
      'tinfoil': resolve(__dirname, 'src/index.browser.ts'),
    },
  },
});
