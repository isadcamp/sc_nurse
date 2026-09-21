import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
 testDir: "./specs", fullyParallel: false, workers: 1, retries: 0,
 reporter: [["html", { open: "never" }], ["list"]],
 use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
 projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
 webServer: [
  { command: "go run ./cmd/roster-test-api", cwd: resolve(__dirname, "../../backend"), env: { ROSTER_TEST_MODE: "1" }, url: "http://127.0.0.1:8180/health", timeout: 60000, reuseExistingServer: false },
  { command: "npm run dev -- --hostname 127.0.0.1 --port 3100", cwd: resolve(__dirname, "../../frontend"), env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:8180/api/v1" }, url: "http://127.0.0.1:3100", timeout: 60000, reuseExistingServer: false },
 ],
});
