import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 40000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    headless: true,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "../docs/evidence/interaction-results.json" }],
  ],
  webServer: [
    {
      command: "npm run preview -- --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
    },
    {
      command: "node scripts/serve.mjs",
      url: "http://127.0.0.1:4174/ipfs/test-cid/",
      reuseExistingServer: true,
    },
  ],
});
