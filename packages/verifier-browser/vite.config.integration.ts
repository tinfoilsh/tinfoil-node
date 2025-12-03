/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    include: ["**/integration.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [
        {
          browser: "chromium",
          launch: {
            args: [
              '--disable-web-security',
              '--disable-features=IsolateOrigins,site-per-process',
            ],
          },
        },
      ],
    },
  },
});
