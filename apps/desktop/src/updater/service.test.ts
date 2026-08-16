import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  UPDATER_CHECK_CHANNEL,
  UPDATER_INSTALL_CHANNEL,
  UPDATER_SET_AUTOMATIC_CHANNEL,
  UPDATER_STATE_CHANNEL,
} from "./ipc.js";
import {
  UPDATER_INTERVAL_MS,
  UPDATER_STARTUP_DELAY_MS,
  createDesktopUpdater,
  sanitizeReleaseNotes,
  type DesktopUpdaterDriver,
  type DriverUpdateInfo,
  type InstallPlan,
} from "./service.js";

type IpcHandler = (senderId: number, input: unknown) => unknown;

function makeHarness(options: { packaged?: boolean; visible?: boolean; focused?: boolean; preference?: boolean; windowAvailable?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "agent-fabric-updater-service-"));
  const preferencesPath = join(directory, "preferences.json");
  if (options.preference !== undefined) writeFileSync(preferencesPath, JSON.stringify({ automaticUpdates: options.preference }));
  const handlers = new Map<string, IpcHandler>();
  const listeners: Record<string, ((value?: unknown) => void)[]> = {};
  const checkForUpdates = vi.fn(async () => ({ available: false, info: { version: "0.1.0-beta.2" } }));
  const install = vi.fn();
  const configureBetaChannel = vi.fn();
  const driver: DesktopUpdaterDriver = {
    configureBetaChannel,
    checkForUpdates,
    install,
    onChecking: (listener) => { (listeners.checking ??= []).push(listener); },
    onAvailable: (listener) => { (listeners.available ??= []).push(listener as (value?: unknown) => void); },
    onNotAvailable: (listener) => { (listeners.notAvailable ??= []).push(listener as (value?: unknown) => void); },
    onProgress: (listener) => { (listeners.progress ??= []).push(listener as (value?: unknown) => void); },
    onDownloaded: (listener) => { (listeners.downloaded ??= []).push(listener as (value?: unknown) => void); },
    onError: (listener) => { (listeners.error ??= []).push(listener); },
  };
  const send = vi.fn();
  const showAndFocus = vi.fn();
  const systemNotification = vi.fn();
  const requestInstall = vi.fn<(plan: InstallPlan) => void>();
  const controller = createDesktopUpdater({
    packaged: options.packaged ?? true,
    currentVersion: "0.1.0-beta.2",
    preferencesPath,
    driver,
    ipc: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedRenderer: (senderId) => senderId === 7,
    getWindow: () => options.windowAvailable === false ? undefined : ({ visible: options.visible ?? true, focused: options.focused ?? true, send, showAndFocus }),
    showSystemNotification: systemNotification,
    requestInstall,
    now: () => new Date("2026-08-16T00:00:00.000Z"),
  });
  const emit = (event: string, value?: unknown) => { for (const listener of listeners[event] ?? []) listener(value); };
  const invoke = async (channel: string, input?: unknown, senderId = 7) => handlers.get(channel)?.(senderId, input);
  return { directory, controller, driver, checkForUpdates, install, configureBetaChannel, send, showAndFocus, systemNotification, requestInstall, emit, invoke };
}

const directories: string[] = [];

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Desktop updater service", () => {
  it("checks after startup and hourly with one configured beta driver", async () => {
    const harness = makeHarness(); directories.push(harness.directory);
    await harness.controller.ready;

    expect(harness.configureBetaChannel).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(UPDATER_STARTUP_DELAY_MS);
    expect(harness.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UPDATER_INTERVAL_MS);
    expect(harness.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("cancels automatic checks but keeps a trusted manual check", async () => {
    const harness = makeHarness({ preference: false }); directories.push(harness.directory);
    await harness.controller.ready;
    await vi.advanceTimersByTimeAsync(UPDATER_STARTUP_DELAY_MS + UPDATER_INTERVAL_MS);
    expect(harness.checkForUpdates).not.toHaveBeenCalled();

    await harness.invoke(UPDATER_CHECK_CHANNEL);
    expect(harness.checkForUpdates).toHaveBeenCalledOnce();
    await expect(harness.invoke(UPDATER_SET_AUTOMATIC_CHANNEL, true)).resolves.toEqual({ automaticUpdates: true });
  });

  it("coalesces concurrent manual checks", async () => {
    const harness = makeHarness(); directories.push(harness.directory);
    await harness.controller.ready;
    let release: (() => void) | undefined;
    harness.checkForUpdates.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ available: false, info: { version: "0.1.0-beta.2" } }); }));

    const first = harness.controller.checkNow();
    const second = harness.controller.checkNow();
    await Promise.resolve();
    expect(harness.checkForUpdates).toHaveBeenCalledOnce();
    release?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "up-to-date", currentVersion: "0.1.0-beta.2", checkedAt: "2026-08-16T00:00:00.000Z" },
      { status: "up-to-date", currentVersion: "0.1.0-beta.2", checkedAt: "2026-08-16T00:00:00.000Z" },
    ]);
  });

  it("publishes bounded progress and a sanitized ready state", async () => {
    const harness = makeHarness({ visible: false }); directories.push(harness.directory);
    await harness.controller.ready;
    harness.emit("available", { version: "0.1.0-beta.3" } satisfies DriverUpdateInfo);
    harness.emit("progress", 142);
    harness.emit("downloaded", { version: "0.1.0-beta.3", releaseNotes: "<b>修复</b>\u0000 更新" } satisfies DriverUpdateInfo);

    expect(harness.controller.snapshot()).toEqual({ status: "ready", currentVersion: "0.1.0-beta.2", targetVersion: "0.1.0-beta.3", releaseNotes: "修复 更新" });
    expect(harness.send).toHaveBeenCalled();
    expect(harness.systemNotification).toHaveBeenCalledWith("0.1.0-beta.3", expect.any(Function));
  });

  it("keeps a downloaded update recoverable when the Renderer window is unavailable", async () => {
    const harness = makeHarness({ windowAvailable: false }); directories.push(harness.directory);
    await harness.controller.ready;

    expect(() => harness.emit("downloaded", { version: "0.1.0-beta.3" } satisfies DriverUpdateInfo)).not.toThrow();
    expect(harness.controller.snapshot()).toMatchObject({ status: "ready", targetVersion: "0.1.0-beta.3" });
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.systemNotification).toHaveBeenCalledOnce();
  });

  it("rejects malformed downloaded metadata without leaking it", async () => {
    const harness = makeHarness(); directories.push(harness.directory);
    await harness.controller.ready;
    harness.emit("downloaded", { version: "../../private/update" } satisfies DriverUpdateInfo);

    expect(harness.controller.snapshot()).toEqual({ status: "error", currentVersion: "0.1.0-beta.2", code: "update-metadata-invalid", retryable: true });
    expect(JSON.stringify(harness.controller.snapshot())).not.toContain("private/update");
  });

  it("coordinates install and never calls the driver before shutdown completes", async () => {
    const harness = makeHarness(); directories.push(harness.directory);
    await harness.controller.ready;
    harness.emit("downloaded", { version: "0.1.0-beta.3" } satisfies DriverUpdateInfo);

    await harness.invoke(UPDATER_INSTALL_CHANNEL);
    expect(harness.requestInstall).toHaveBeenCalledOnce();
    expect(harness.install).not.toHaveBeenCalled();
    harness.requestInstall.mock.calls[0]?.[0].finish();
    expect(harness.install).toHaveBeenCalledOnce();
  });

  it("prepares the same coordinated install path for an explicit full quit", async () => {
    const harness = makeHarness(); directories.push(harness.directory);
    await harness.controller.ready;
    harness.emit("downloaded", { version: "0.1.0-beta.3" } satisfies DriverUpdateInfo);

    const plan = harness.controller.prepareInstallOnFullQuit();
    expect(plan).toBeDefined();
    expect(harness.controller.snapshot()).toMatchObject({ status: "installing", targetVersion: "0.1.0-beta.3" });
    expect(harness.install).not.toHaveBeenCalled();
    plan?.finish();
    expect(harness.install).toHaveBeenCalledOnce();
  });

  it("rejects untrusted Renderer IPC and keeps raw failures out of state", async () => {
    const harness = makeHarness(); directories.push(harness.directory);
    await harness.controller.ready;
    await expect(harness.invoke(UPDATER_STATE_CHANNEL, undefined, 99)).rejects.toThrow("untrusted-renderer");
    harness.checkForUpdates.mockRejectedValueOnce(new Error("ECONNREFUSED /Users/private/token"));
    await expect(harness.controller.checkNow()).resolves.toEqual({ status: "error", currentVersion: "0.1.0-beta.2", code: "update-network-failed", retryable: true });
    expect(JSON.stringify(harness.controller.snapshot())).not.toContain("/Users/private/token");
  });

  it("never configures or contacts the production feed when unpackaged", async () => {
    const harness = makeHarness({ packaged: false }); directories.push(harness.directory);
    await harness.controller.ready;
    await vi.advanceTimersByTimeAsync(UPDATER_STARTUP_DELAY_MS + UPDATER_INTERVAL_MS);
    expect(harness.configureBetaChannel).not.toHaveBeenCalled();
    expect(harness.checkForUpdates).not.toHaveBeenCalled();
    await expect(harness.controller.checkNow()).resolves.toMatchObject({ status: "error", code: "updater-unavailable" });
  });
});

describe("release-note sanitization", () => {
  it("flattens structured notes and removes markup and controls", () => {
    expect(sanitizeReleaseNotes([{ note: "<p>One</p>" }, { note: "Two\u0000" }])).toBe("One Two");
  });
});
