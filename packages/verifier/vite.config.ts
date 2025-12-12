/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/*.browser.test.ts", "**/node_modules/**"],
  },
});
