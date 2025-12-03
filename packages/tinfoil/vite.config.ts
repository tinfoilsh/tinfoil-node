/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    include: ["src/__tests__/*.test.ts"],
    exclude: ["src/__tests__/*.browser.integration.test.ts"],
  },
});
