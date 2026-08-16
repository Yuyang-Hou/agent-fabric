import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromDesktop = createRequire(path.join(root, "apps", "desktop", "package.json"));
const { app, BrowserWindow } = requireFromDesktop("electron");
const outputPath = path.resolve(process.argv[2] ?? path.join(root, "apps", "desktop", "build", "acceptance.png"));
const acceptancePrompt = process.env.AGENT_FABRIC_CAPTURE_PROMPT;
const acceptancePage = process.env.AGENT_FABRIC_CAPTURE_PAGE;
const captureTheme = process.env.AGENT_FABRIC_CAPTURE_THEME;
const captureInteraction = process.env.AGENT_FABRIC_CAPTURE_INTERACTION;

const hardTimeout = setTimeout(() => {
  console.error("desktop-capture: timed out");
  app.exit(2);
}, acceptancePrompt ? 150_000 : 20_000);

console.log("desktop-capture: runtime", JSON.stringify({
  electron: process.versions.electron,
  node: process.versions.node,
  processType: process.type,
  defaultApp: process.defaultApp,
  appReady: app.isReady(),
}));
console.log("desktop-capture: loading product main");
async function capture() {
  console.log("desktop-capture: app ready");
  const deadline = Date.now() + 10_000;
  let window;
  while (Date.now() < deadline) {
    window = BrowserWindow.getAllWindows().find((candidate) => candidate.isVisible());
    if (window && !window.webContents.isLoading()) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!window) throw new Error("desktop-window-not-ready");
  if (captureTheme === "dark" || captureTheme === "light") {
    const { nativeTheme } = requireFromDesktop("electron");
    nativeTheme.themeSource = captureTheme;
  }
  console.log("desktop-capture: renderer ready");
  const rendererState = await window.webContents.executeJavaScript("({ accountApi: typeof window.agentFabricAccount, legacyApi: typeof window.agentFabric, root: document.querySelector('#root')?.innerHTML.slice(0, 120) ?? 'missing' })");
  console.log("desktop-capture: renderer state", JSON.stringify(rendererState));
  if (acceptancePage) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const switched = await window.webContents.executeJavaScript(`(() => {
      const target = document.querySelectorAll("nav button")[${acceptancePage === "agent" ? 0 : acceptancePage === "friends" ? 1 : 2}];
      if (!(target instanceof HTMLElement)) return false;
      target.click();
      if (${JSON.stringify(acceptancePage)} === "activity") setTimeout(() => {
        const row = document.querySelectorAll(".activity-row")[1];
        if (row instanceof HTMLElement) row.click();
      }, 50);
      return true;
    })()`);
    if (!switched) throw new Error("capture-page-not-found");
    await new Promise((resolve) => setTimeout(resolve, 500));
  } else if (acceptancePrompt) {
    await window.webContents.executeJavaScript(
      `window.agentFabric.command(${JSON.stringify({
        type: "message.send",
        roomId: "room-alice-bob",
        text: acceptancePrompt,
      })})`,
    );
    await waitForTerminalTask(window, 120_000);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 2_200));
  }
  if (captureInteraction) {
    const applied = await window.webContents.executeJavaScript(`(async () => {
      const clickText = (selector, text) => {
        const target = [...document.querySelectorAll(selector)].find((element) => element.textContent?.trim().startsWith(text));
        if (!(target instanceof HTMLElement)) return false;
        target.click();
        return true;
      };
      switch (${JSON.stringify(captureInteraction)}) {
        case "filter": return clickText("button", "筛选");
        case "columns": {
          const target = document.querySelector('button[aria-label="配置列"]');
          if (!(target instanceof HTMLElement)) return false;
          target.click();
          return true;
        }
        case "batch": {
          const target = document.querySelector('[role="checkbox"][aria-label="选择 Agent Fabric Helper"]');
          if (!(target instanceof HTMLElement)) return false;
          target.click();
          return true;
        }
        case "dirty-guard": {
          const input = document.querySelector('.settings-column input:not([type="checkbox"]):not([type="number"])');
          if (!(input instanceof HTMLInputElement)) return false;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          setter?.call(input, input.value + " · 已修改");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (!clickText(".intent-tabs button", "概览")) return false;
          await new Promise((resolve) => setTimeout(resolve, 100));
          return Boolean(document.querySelector("#dirty-title"));
        }
        default: return false;
      }
    })()`);
    if (!applied) throw new Error(`capture-interaction-not-found:${captureInteraction}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await window.webContents.executeJavaScript("window.scrollTo(0, 0)");
  const layout = await window.webContents.executeJavaScript(`({
    width: window.innerWidth,
    height: window.innerHeight,
    visualViewportHeight: window.visualViewport?.height,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.getBoundingClientRect().height,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.getBoundingClientRect().height,
    rootHeight: document.querySelector("#root")?.getBoundingClientRect().height,
    frameHeight: document.querySelector(".product-frame")?.getBoundingClientRect().height,
    canvasBottom: document.querySelector(".product-canvas")?.getBoundingClientRect().bottom,
    wrappedButtons: [...document.querySelectorAll("button")].filter((button) => !button.matches(".method-card, .template-grid button") && getComputedStyle(button).whiteSpace !== "nowrap").map((button) => button.getAttribute("aria-label") || button.textContent)
  })`);
  console.log("desktop-capture: layout", JSON.stringify(layout));
  if (layout.documentWidth > layout.width || layout.bodyWidth > layout.width || layout.wrappedButtons.length) throw new Error("desktop-layout-safety-failed");
  const image = await window.webContents.capturePage();
  await fs.writeFile(outputPath, image.toPNG());
  console.log(`desktop-capture: ${outputPath}`);
  clearTimeout(hardTimeout);
  app.exit(0);
}

async function waitForTerminalTask(window, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await window.webContents.executeJavaScript(
      "window.agentFabric.getSnapshot().then(snapshot => snapshot.room?.messages.at(-1)?.content)",
    );
    if (task?.kind === "task" && ["completed", "failed", "canceled", "rejected"].includes(task.task.state)) {
      if (task.task.state !== "completed") throw new Error(`desktop-task-${task.task.state}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("desktop-task-timeout");
}

function fail(error) {
  clearTimeout(hardTimeout);
  console.error("desktop-capture:", error);
  app.exit(1);
}

void import(pathToFileURL(path.join(root, "apps", "desktop", "build", "main.mjs")).href)
  .then(() => {
    console.log("desktop-capture: waiting for app ready");
    return app.whenReady().then(capture);
  })
  .catch(fail);
