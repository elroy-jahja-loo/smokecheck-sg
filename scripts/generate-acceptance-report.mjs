#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";

const baseUrl = process.env.SMOKECHECK_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3400";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(process.cwd(), ".local", "acceptance-reports", timestamp);
const toolDir = resolve(process.cwd(), ".local", "ui-acceptance-tools");
mkdirSync(outDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  checks: [],
};

let server;
let serverPid;

function record(name, status, details = {}) {
  report.checks.push({ name, status, ...details });
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  return result;
}

function ensurePlaywrightTooling() {
  mkdirSync(toolDir, { recursive: true });
  const packageJsonPath = join(toolDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    writeFileSync(packageJsonPath, JSON.stringify({ private: true, type: "module" }, null, 2));
  }
  const playwrightModule = join(toolDir, "node_modules", "playwright");
  if (!existsSync(playwrightModule)) {
    assertCommand("install-playwright", "npm", ["install", "--no-save", "playwright@latest"], { cwd: toolDir });
  }
  assertCommand("install-playwright-browser", "npx", ["playwright", "install", "chromium"], { cwd: toolDir });
}

function assertCommand(name, command, args, options = {}) {
  console.log(`==> ${name}: ${command} ${args.join(" ")}`);
  const result = runCommand(command, args, options);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    if (output) console.error(output);
    record(name, "failed", { output });
    throw new Error(`${name} failed`);
  }
  console.log(`✔ ${name}`);
  record(name, "passed", { output });
}

async function waitForServer(url, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 500));
  }
  return false;
}

function startServer() {
  const logPath = join(outDir, "next-start.log");
  server = spawn("npm", ["run", "start", "--", "--port", "3400"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverPid = server.pid;
  let logBuffer = "";
  server.stdout.on("data", (chunk) => { logBuffer += String(chunk); });
  server.stderr.on("data", (chunk) => { logBuffer += String(chunk); });
  console.log(`==> start-server: npm run start -- --port 3400 (pid=${serverPid})`);
  return { logPath, flush: () => writeFileSync(logPath, logBuffer, "utf8") };
}

function runLoadStress(baseUrlToUse) {
  const attempts = [
    { concurrency: "12", requests: "240" },
    { concurrency: "8", requests: "180" },
    { concurrency: "4", requests: "120" },
  ];
  const attemptResults = [];

  for (const attempt of attempts) {
    const loadResult = runCommand("npm", ["run", "load:smokecheck"], {
      timeout: 8 * 60 * 1000,
      env: {
        ...process.env,
        SMOKECHECK_BASE_URL: baseUrlToUse,
        SMOKECHECK_LOAD_CONCURRENCY: attempt.concurrency,
        SMOKECHECK_LOAD_REQUESTS: attempt.requests,
        SMOKECHECK_REQUEST_TIMEOUT_MS: "15000",
        SMOKECHECK_INCLUDE_RAG: "false",
      },
    });
    const output = `${loadResult.stdout ?? ""}${loadResult.stderr ?? ""}`.trim();
    const metrics = extractLoadMetrics(output);
    const failureRate = metrics && metrics.requests > 0 ? metrics.failures / metrics.requests : undefined;
    const acceptable = Boolean(
      metrics
      && failureRate !== undefined
      && failureRate <= 0.2
      && metrics.p95Ms <= 16000,
    );

    attemptResults.push({
      status: loadResult.status,
      concurrency: attempt.concurrency,
      requests: attempt.requests,
      acceptable,
      failureRate,
      metrics,
      output,
    });

    if (loadResult.status === 0 || acceptable) return { status: "passed", attemptResults };
  }

  return { status: "failed", attemptResults };
}

function extractLoadMetrics(output) {
  const start = output.lastIndexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  const jsonLike = output.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonLike);
    if (typeof parsed.requests !== "number" || typeof parsed.failures !== "number") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function stopServer() {
  if (server && !server.killed) server.kill("SIGTERM");
}

async function runBrowserChecks() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(join(toolDir, "node_modules", "playwright"));
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: "320-511", width: 390, height: 844 },
    { name: "512-767", width: 540, height: 900 },
    { name: "768-1023", width: 800, height: 1024 },
    { name: "1024+", width: 1280, height: 900 },
  ];
  const perViewport = [];
  const screenshotsDir = join(outDir, "screenshots");
  mkdirSync(screenshotsDir, { recursive: true });

  try {
    for (const viewport of viewports) {
      console.log(`==> browser-e2e viewport ${viewport.name} (${viewport.width}x${viewport.height})`);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        geolocation: { latitude: 1.3048, longitude: 103.8318 },
        permissions: [],
      });
      const page = await context.newPage();

      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("textbox", { name: "Search by address or landmark" }).fill("313 Orchard Road");
      await page.getByRole("button", { name: "Search" }).click();
      await page.getByRole("button", { name: "Use my location" }).waitFor({ state: "visible" });
      const homePath = join(screenshotsDir, `home-${viewport.name}.png`);
      await page.screenshot({ path: homePath, fullPage: true });

      await page.goto(`${baseUrl}/rules`, { waitUntil: "domcontentloaded" });
      const accordion = page.locator("summary").filter({ hasText: "Covered walkways" }).first();
      await accordion.waitFor({ state: "visible" });
      await accordion.click();
      const expandedGuidance = page.locator("details[open]").locator("p").filter({ hasText: "This tool provides guidance" }).first();
      await expandedGuidance.waitFor({ state: "visible" });
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? null);
      const rulesPath = join(screenshotsDir, `rules-${viewport.name}.png`);
      await page.screenshot({ path: rulesPath, fullPage: true });

      await page.goto(`${baseUrl}/ops/login`, { waitUntil: "domcontentloaded" });
      const usernameFields = await page.locator('input[type="text"], input[type="email"], input[type="password"]').count();
      await page.getByRole("button", { name: "Log in with Singpass" }).click();
      await page.waitForURL(/\/ops\/dashboard/);
      await page.getByRole("button", { name: "Create enforcement report" }).waitFor();
      const dashboardPath = join(screenshotsDir, `ops-dashboard-${viewport.name}.png`);
      await page.screenshot({ path: dashboardPath, fullPage: true });

      const deniedContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        permissions: [],
      });
      const deniedPage = await deniedContext.newPage();
      await deniedPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await deniedPage.getByRole("button", { name: "Use my location" }).click();
      await deniedPage.getByText("Location was not enabled", { exact: false }).first().waitFor();
      const deniedText = await deniedPage.locator(".live-error").first().textContent().catch(() => null);
      const deniedPath = join(screenshotsDir, `geo-denied-${viewport.name}.png`);
      await deniedPage.screenshot({ path: deniedPath, fullPage: true });
      await deniedContext.close();

      const allowContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        geolocation: { latitude: 1.3048, longitude: 103.8318 },
        permissions: ["geolocation"],
      });
      const allowPage = await allowContext.newPage();
      await allowPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await allowPage.getByRole("button", { name: "Use my location" }).click();
      await allowPage.locator(".selected-location-summary").first().waitFor();
      const allowPath = join(screenshotsDir, `geo-allowed-${viewport.name}.png`);
      await allowPage.screenshot({ path: allowPath, fullPage: true });
      const hasSelected = await allowPage.locator(".selected-location-summary").count();
      await allowContext.close();

      perViewport.push({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        keyboardNavigation: Boolean(activeTag && activeTag !== "BODY"),
        loginHasCredentialFields: usernameFields > 0,
        geolocationDeniedMessage: deniedText,
        geolocationAllowedSelectedSummary: hasSelected > 0,
        screenshots: {
          home: homePath,
          rules: rulesPath,
          dashboard: dashboardPath,
          geoDenied: deniedPath,
          geoAllowed: allowPath,
        },
      });

      await context.close();
      console.log(`✔ browser-e2e viewport ${viewport.name}`);
    }
  } finally {
    await browser.close();
  }

  return perViewport;
}

async function main() {
  try {
    console.log(`Acceptance report output: ${outDir}`);
    ensurePlaywrightTooling();
    assertCommand("typecheck", "npm", ["run", "typecheck"]);
    assertCommand("lint", "npm", ["run", "lint"]);
    assertCommand("test", "npm", ["run", "test"]);
    assertCommand("build", "npm", ["run", "build"]);

    const serverLog = startServer();
    const ready = await waitForServer(baseUrl);
    if (!ready) {
      serverLog.flush();
      record("start-server", "failed", { pid: serverPid, logPath: serverLog.logPath });
      throw new Error("Server did not become ready");
    }
    record("start-server", "passed", { pid: serverPid, baseUrl });
    console.log(`✔ start-server ready at ${baseUrl}`);

    console.log("==> load-stress: adaptive attempts");
    const loadStress = runLoadStress(baseUrl);
    record("load-stress", loadStress.status, { attempts: loadStress.attemptResults });
    console.log(loadStress.status === "passed" ? "✔ load-stress" : "✘ load-stress");

    const viewportChecks = await runBrowserChecks();
    record("browser-e2e", "passed", { viewportChecks });
    console.log("✔ browser-e2e");

    serverLog.flush();
    stopServer();
  } catch (error) {
    record("fatal", "failed", { message: String(error?.message ?? error) });
    stopServer();
    process.exitCode = 1;
  } finally {
    const reportPath = join(outDir, "acceptance-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    const summaryPath = join(outDir, "acceptance-report.md");
    const lines = [
      "# SmokeCheck Acceptance Report",
      "",
      `Generated: ${report.generatedAt}`,
      `Base URL: ${report.baseUrl}`,
      "",
      "## Checks",
      ...report.checks.map((check) => `- ${check.status === "passed" ? "PASS" : "FAIL"} ${check.name}`),
      "",
      `JSON artifact: ${join(outDir, "acceptance-report.json")}`,
      `Screenshots: ${join(outDir, "screenshots")}`,
    ];
    writeFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
    console.log(`Acceptance summary: ${summaryPath}`);

    if (server && !server.killed) stopServer();
  }
}

await main();
