import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://127.0.0.1:3100", ...devices["Pixel 5"], serviceWorkers: "block" },
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://127.0.0.1:3100/smoking-areas",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
