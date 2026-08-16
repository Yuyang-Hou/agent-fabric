import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    getVersion: vi.fn(() => "0.1.0-beta.2"),
    getPath: vi.fn(() => "/tmp/agent-fabric-updater-main-test"),
  },
  ipcMain: { handle: vi.fn() },
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    autoRunAppAfterInstall: false,
    allowPrerelease: false,
    allowDowngrade: true,
    fullChangelog: true,
    channel: "latest",
    logger: undefined as unknown,
    checkForUpdates: vi.fn(async () => null),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: mocks.app,
  ipcMain: mocks.ipcMain,
  Notification: class Notification {
    static isSupported() { return false; }
  },
}));
vi.mock("electron-updater", () => ({ default: { autoUpdater: mocks.autoUpdater } }));

import { setupDesktopUpdater } from "./main.js";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Electron updater adapter", () => {
  it("pins the packaged public beta channel without downgrade or quit-time library installation", async () => {
    vi.useFakeTimers();
    const controller = setupDesktopUpdater({
      getMainWindow: () => undefined,
      isTrustedRenderer: () => true,
      requestInstall: vi.fn(),
    });
    await controller.ready;

    expect(mocks.autoUpdater.autoDownload).toBe(true);
    expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(mocks.autoUpdater.autoRunAppAfterInstall).toBe(true);
    expect(mocks.autoUpdater.allowPrerelease).toBe(true);
    expect(mocks.autoUpdater.channel).toBe("beta");
    expect(mocks.autoUpdater.allowDowngrade).toBe(false);
    expect(mocks.autoUpdater.fullChangelog).toBe(false);
    expect(mocks.autoUpdater.on).toHaveBeenCalledTimes(6);
    expect(mocks.app.getPath).toHaveBeenCalledWith("userData");
    controller.dispose();
  });
});
