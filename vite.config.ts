import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // GitHub Pages serves the site under /iotmonitoring/; local builds stay at /
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  css: { modules: { localsConvention: "camelCaseOnly" } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
