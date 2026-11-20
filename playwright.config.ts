import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:4180", viewport: { width: 1440, height: 900 } },
  webServer: { command: "npx vite preview --port 4180 --strictPort", port: 4180, reuseExistingServer: false },
});
