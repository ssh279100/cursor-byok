import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", channel: "msedge", viewport: { width: 1280, height: 900 } },
  webServer: { command: "npm run serve -- --port 4173 --host 127.0.0.1", url: "http://127.0.0.1:4173/__byok-api__/", reuseExistingServer: false },
});
