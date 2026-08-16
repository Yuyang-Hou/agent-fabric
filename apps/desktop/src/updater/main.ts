import path from "node:path";

import { app, type BrowserWindow, ipcMain, Notification } from "electron";
import electronUpdater, { type UpdateInfo } from "electron-updater";

import { createDesktopUpdater, type DesktopUpdaterController, type DriverUpdateInfo, type InstallPlan } from "./service.js";

const { autoUpdater } = electronUpdater;

export interface SetupDesktopUpdaterOptions {
  readonly getMainWindow: () => BrowserWindow | undefined;
  readonly isTrustedRenderer: (senderId: number) => boolean;
  readonly requestInstall: (plan: InstallPlan) => void;
}

export function setupDesktopUpdater(options: SetupDesktopUpdaterOptions): DesktopUpdaterController {
  return createDesktopUpdater({
    packaged: app.isPackaged,
    currentVersion: app.getVersion(),
    preferencesPath: path.join(app.getPath("userData"), "updater", "preferences.json"),
    driver: {
      configureBetaChannel() {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = false;
        autoUpdater.autoRunAppAfterInstall = true;
        autoUpdater.allowPrerelease = true;
        autoUpdater.channel = "beta";
        autoUpdater.allowDowngrade = false;
        autoUpdater.fullChangelog = false;
        autoUpdater.logger = {
          info: () => undefined,
          warn: () => console.warn("desktop-updater:warning"),
          error: () => console.error("desktop-updater:error"),
        };
      },
      async checkForUpdates() {
        const result = await autoUpdater.checkForUpdates();
        if (!result) return null;
        return {
          available: result.isUpdateAvailable,
          info: mapUpdateInfo(result.updateInfo),
          ...(result.downloadPromise ? { download: result.downloadPromise } : {}),
        };
      },
      install: () => autoUpdater.quitAndInstall(false, true),
      onChecking: (listener) => { autoUpdater.on("checking-for-update", listener); },
      onAvailable: (listener) => { autoUpdater.on("update-available", (info) => listener(mapUpdateInfo(info))); },
      onNotAvailable: (listener) => { autoUpdater.on("update-not-available", (info) => listener(mapUpdateInfo(info))); },
      onProgress: (listener) => { autoUpdater.on("download-progress", (progress) => listener(progress.percent)); },
      onDownloaded: (listener) => { autoUpdater.on("update-downloaded", (info) => listener(mapUpdateInfo(info))); },
      onError: (listener) => { autoUpdater.on("error", listener); },
    },
    ipc: {
      handle(channel, handler) {
        ipcMain.handle(channel, (event, input: unknown) => handler(event.sender.id, input));
      },
    },
    isTrustedRenderer: options.isTrustedRenderer,
    getWindow() {
      const window = options.getMainWindow();
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return undefined;
      return {
        visible: window.isVisible(),
        focused: window.isFocused(),
        send: (channel, payload) => window.webContents.send(channel, payload),
        showAndFocus() { window.show(); window.focus(); },
      };
    },
    showSystemNotification(version, onClick) {
      if (!Notification.isSupported()) return;
      const notification = new Notification({ title: "Agent Fabric 更新已就绪", body: `版本 ${version} 已下载，返回 Agent Fabric 可选择重启并更新。` });
      notification.on("click", onClick);
      notification.show();
    },
    requestInstall: options.requestInstall,
  });
}

function mapUpdateInfo(info: UpdateInfo): DriverUpdateInfo {
  return { version: info.version, releaseNotes: info.releaseNotes };
}
