/// <reference types="vitest" />
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    target: "esnext",
    minify: "esbuild",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "TinfoilVerifier",
      formats: ["es", "iife"],
      fileName: (format) => format === "iife" ? "verifier.min.js" : "index.js",
    },
    rollupOptions: {
      output: {
        globals: {},
      },
    },
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/*.browser.test.ts", "**/node_modules/**"],
  },
});
