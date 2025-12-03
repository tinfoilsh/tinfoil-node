/// <reference types="vitest" />
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist/browser",
    target: "esnext",
    minify: "esbuild",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "TinfoilVerifier",
      formats: ["iife"],
      fileName: () => "verifier.min.js",
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
