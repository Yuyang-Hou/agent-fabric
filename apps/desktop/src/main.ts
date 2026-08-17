import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain, Menu, safeStorage, shell } from "electron";
import WebSocket from "ws";
import {
  FileCredentialBlobStore,
  LocalAgentBuilder,
  createCodexRuntimeAdapter,
  installAccountAgentMcp,
  resolveCodexExecutablePath,
} from "@agent-fabric/edge-host";

import { DesktopAccountProductAuthentication } from "./account-product/authentication.js";
import { AccountProductHost } from "./account-product/host.js";
import { AccountProductInvalidationClient, type AccountEventsSocketFactory } from "./account-product/invalidation-client.js";
import { AccountProductSessionServices } from "./account-product/session-services.js";
import { DesktopAccountAgentMcp } from "./account-agent-mcp.js";
import { DesktopAccountRuntime } from "./account-runtime.js";
import {
  ACCOUNT_PRODUCT_CHANGED_CHANNEL,
  ACCOUNT_PRODUCT_COMMAND_CHANNEL,
  ACCOUNT_PRODUCT_SNAPSHOT_CHANNEL,
  accountProductRendererCommandSchema,
  accountProductRendererSnapshotSchema,
} from "./account-product/ipc.js";
import { SafeStorageCredentialVault } from "./account-infrastructure/credential-vault.js";
import { DesktopGoogleLogin } from "./account-infrastructure/google-login.js";
import { DesktopHostLifecycle } from "./account-infrastructure/lifecycle.js";
import { resolveServerBaseUrl } from "./account-infrastructure/server-base-url.js";
import { setupDesktopUpdater } from "./updater/main.js";
import type { DesktopUpdaterController, InstallPlan } from "./updater/service.js";

declare const __AGENT_FABRIC_PACKAGED_SERVER__: string;

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, "../../..");
let mainWindow: BrowserWindow | undefined;
let credentialVault: SafeStorageCredentialVault | undefined;
let googleLogin: DesktopGoogleLogin | undefined;
let serverBaseUrl: string | undefined;
let accountProductHost: AccountProductHost | undefined;
let accountRestore: Promise<unknown> | undefined;
let accountSessionServices: AccountProductSessionServices | undefined;
let accountRuntimeAdapter: ReturnType<typeof createCodexRuntimeAdapter> | undefined;
let localAgentBuilder: LocalAgentBuilder | undefined;
let desktopUpdater: DesktopUpdaterController | undefined;
const hostLifecycle = new DesktopHostLifecycle();
const ownsSingleInstance = app.requestSingleInstanceLock();

function requireAccountProductHost(): AccountProductHost {
  if (!accountProductHost) throw new Error("account-product-host-unavailable");
  return accountProductHost;
}

function restoreAccountProductOnce(): Promise<unknown> {
  accountRestore ??= requireAccountProductHost().restore();
  return accountRestore;
}

function assertMainRenderer(senderId: number): void {
  if (!mainWindow || mainWindow.isDestroyed() || senderId !== mainWindow.webContents.id) throw new Error("untrusted-renderer");
}

function diagnostic(message: string): void {
  if (process.env.AGENT_FABRIC_EDGE_DIAGNOSTICS === "1") console.error(message);
}

async function stopLocalServices(): Promise<void> {
  await localAgentBuilder?.close();
  await accountSessionServices?.stop();
  await accountRuntimeAdapter?.shutdown();
}

function requestUpdaterInstall(plan: InstallPlan): void {
  const decision = hostLifecycle.requestFullQuit(stopLocalServices, plan.finish, plan.onFailure);
  if (decision === "allow") plan.finish();
}

async function createMainWindow(): Promise<void> {
  const captureWidth = Number(process.env.AGENT_FABRIC_CAPTURE_WIDTH);
  const captureHeight = Number(process.env.AGENT_FABRIC_CAPTURE_HEIGHT);
  const isCaptureSize = Number.isInteger(captureWidth) && captureWidth >= 320;
  mainWindow = new BrowserWindow({
    width: isCaptureSize ? captureWidth : 1280,
    height: Number.isInteger(captureHeight) && captureHeight >= 568 ? captureHeight : 820,
    minWidth: isCaptureSize ? 320 : 414,
    minHeight: isCaptureSize ? 480 : 640,
    titleBarStyle: "hiddenInset",
    webPreferences: { preload: path.join(currentDirectory, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.on("close", (event) => {
    if (hostLifecycle.shouldHideWindow(process.platform)) {
      event.preventDefault();
      void accountProductHost?.discardCreationSession().catch(() => undefined);
      mainWindow?.hide();
    }
  });
  const fixture = process.env.AGENT_FABRIC_MODE === "account-ui-acceptance" ? process.env.AGENT_FABRIC_CAPTURE_STATE || "agents" : undefined;
  await mainWindow.loadFile(path.join(currentDirectory, "index.html"), fixture ? { query: { fixture } } : undefined);
}

if (!ownsSingleInstance) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    credentialVault = new SafeStorageCredentialVault(safeStorage, new FileCredentialBlobStore(path.join(app.getPath("userData"), "credentials")));
    const packagedServerBaseUrl = typeof __AGENT_FABRIC_PACKAGED_SERVER__ === "string" ? __AGENT_FABRIC_PACKAGED_SERVER__ : undefined;
    serverBaseUrl = resolveServerBaseUrl(process.env.AGENT_FABRIC_SERVER, packagedServerBaseUrl);
    const edgeBuildDirectory = app.isPackaged ? path.join(process.resourcesPath, "edge-host") : path.resolve(currentDirectory, "../../edge-host/build");
    const codexExecutablePath = resolveCodexExecutablePath({ explicitPath: process.env.CODEX_PATH, pathValue: process.env.PATH, homeDirectory: app.getPath("home") });
    accountRuntimeAdapter = createCodexRuntimeAdapter({
      adapterPath: path.join(edgeBuildDirectory, "codex-acp.mjs"),
      nodeExecutablePath: process.execPath,
      environment: { ELECTRON_RUN_AS_NODE: "1", ...(codexExecutablePath ? { CODEX_PATH: codexExecutablePath } : {}) },
    });
    localAgentBuilder = new LocalAgentBuilder(accountRuntimeAdapter, app.isPackaged ? app.getPath("userData") : repositoryRoot);
    accountSessionServices = new AccountProductSessionServices({ runtime: new DesktopAccountRuntime(), mcp: new DesktopAccountAgentMcp(), installMcp: installAccountAgentMcp });
    if (serverBaseUrl) googleLogin = new DesktopGoogleLogin({ serverBaseUrl, deviceName: `${app.getName()} on ${process.platform}`, openExternal: async (url) => { await shell.openExternal(url); } });
    if (serverBaseUrl && googleLogin) accountProductHost = new AccountProductHost(new DesktopAccountProductAuthentication({
      serverBaseUrl, credentialVault, googleLogin,
      subscribeInvalidations: (origin, token, onEvent, onConnection) => {
        const client = new AccountProductInvalidationClient({ serverBaseUrl: origin, token, socketFactory: accountEventsSocketFactory, onEvent, onConnection });
        client.start();
        return () => client.stop();
      },
      onSessionLoaded: async ({ token, session }) => {
        const services = accountSessionServices;
        const adapter = accountRuntimeAdapter;
        if (!services || !adapter || !serverBaseUrl) return;
        const status = await services.start({
          runtime: {
            server: serverBaseUrl,
            accountSessionToken: token,
            accountId: session.accountId,
            userId: session.userId,
            workspaceRoot: app.isPackaged ? app.getPath("userData") : repositoryRoot,
            name: `${app.getName()} on ${process.platform}`,
            adapter,
            privateConfigurationDirectory: path.join(app.getPath("userData"), "account-product", "private-agent-configuration"),
            encryption: {
              encrypt(value) {
                if (!safeStorage.isEncryptionAvailable()) throw new Error("secure-storage-unavailable");
                return safeStorage.encryptString(value);
              },
              decrypt(value) {
                if (!safeStorage.isEncryptionAvailable()) throw new Error("secure-storage-unavailable");
                return safeStorage.decryptString(value);
              },
            },
          },
          mcp: {
            serverBaseUrl,
            accountSessionToken: token,
            accountId: session.accountId,
            userId: session.userId,
            sessionExpiresAt: session.expiresAt,
            dataDirectory: path.join(app.getPath("userData"), "account-product", "mcp"),
          },
          mcpInstallation: {
            runtimeExecutable: process.execPath,
            mcpExecutable: path.join(edgeBuildDirectory, "account-agent-mcp.mjs"),
          },
        });
        diagnostic(`account-session-services:runtime-${status.runtime.state}:mcp-${status.mcp.state}`);
        return status;
      },
      onSessionCleared: async () => { await accountSessionServices?.stop(); },
    }), {
      diagnostic,
      refreshLocalRuntime: (runtimeId, expectedVersion) => {
        const services = accountSessionServices;
        if (!services) return Promise.reject(new Error("runtime-refresh-not-local"));
        return services.refreshRuntime(runtimeId, expectedVersion);
      },
      runLocalBuilderTurn: async ({ runtimeId, text, configuration }) => {
        const status = accountSessionServices?.status?.runtime;
        if (!status || status.state !== "ready" || status.runtimeId !== runtimeId || !localAgentBuilder) throw new Error("runtime-not-ready");
        return localAgentBuilder.turn({ text, configuration });
      },
      closeLocalBuilder: async () => { await localAgentBuilder?.close(); },
    });
    ipcMain.handle(ACCOUNT_PRODUCT_SNAPSHOT_CHANNEL, async (event) => {
      assertMainRenderer(event.sender.id);
      await restoreAccountProductOnce();
      return accountProductRendererSnapshotSchema.parse(requireAccountProductHost().snapshot());
    });
    ipcMain.handle(ACCOUNT_PRODUCT_COMMAND_CHANNEL, async (event, value: unknown) => {
      assertMainRenderer(event.sender.id);
      const command = accountProductRendererCommandSchema.parse(value);
      if (!command.type.startsWith("login-")) await restoreAccountProductOnce();
      return requireAccountProductHost().command(command);
    });
    accountProductHost?.subscribe((snapshot) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ACCOUNT_PRODUCT_CHANGED_CHANNEL, accountProductRendererSnapshotSchema.parse(snapshot)); });
    desktopUpdater = setupDesktopUpdater({
      getMainWindow: () => mainWindow,
      isTrustedRenderer: (senderId) => Boolean(mainWindow && !mainWindow.isDestroyed() && senderId === mainWindow.webContents.id),
      requestInstall: requestUpdaterInstall,
    });
    await desktopUpdater.ready;
    installApplicationMenu();
    await createMainWindow();
    app.on("activate", () => { if (!mainWindow || mainWindow.isDestroyed()) void createMainWindow(); else { mainWindow.show(); mainWindow.focus(); } });
  });
}

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", (event) => {
  const updatePlan = desktopUpdater?.prepareInstallOnFullQuit();
  const decision = hostLifecycle.requestFullQuit(stopLocalServices, updatePlan?.finish ?? (() => app.quit()), updatePlan?.onFailure);
  if (decision === "wait") event.preventDefault();
});

function installApplicationMenu(): void {
  const logout = () => { void accountProductHost?.command({ type: "logout" }).catch(() => undefined); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { label: "显示 Agent Fabric", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
        { type: "separator" },
        { label: "检查更新…", enabled: app.isPackaged, click: () => { mainWindow?.show(); mainWindow?.focus(); void desktopUpdater?.checkNow(); } },
        {
          label: "自动更新",
          type: "checkbox",
          enabled: app.isPackaged,
          checked: desktopUpdater?.automaticUpdates ?? true,
          click: (item) => { void desktopUpdater?.setAutomaticUpdates(item.checked).catch(() => installApplicationMenu()); },
        },
        { type: "separator" },
        { label: "退出登录", click: logout },
        { type: "separator" },
        { label: "完全退出", accelerator: "CommandOrControl+Q", click: () => app.quit() },
      ],
    },
    { role: "editMenu" },
    { role: "windowMenu" },
  ]));
}

const accountEventsSocketFactory: AccountEventsSocketFactory = {
  connect(url, authorization) {
    const socket = new WebSocket(url, { headers: { authorization }, maxPayload: 64_000 });
    return {
      get readyState() { return socket.readyState; },
      on(event, listener) { socket.on(event, listener as never); },
      close(code, reason) { socket.close(code, reason); },
    };
  },
};
