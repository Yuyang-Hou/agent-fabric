import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({ ipcRenderer: mocks }));

import { UPDATER_CHANGED_CHANNEL, UPDATER_CHECK_CHANNEL, UPDATER_SET_AUTOMATIC_CHANNEL } from "./ipc.js";
import { updaterPreloadApi } from "./preload.js";

describe("Desktop updater preload", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("validates commands and returned state", async () => {
    mocks.invoke.mockResolvedValueOnce({ status: "up-to-date", currentVersion: "0.1.0-beta.2", checkedAt: "2026-08-16T00:00:00.000Z" });
    await expect(updaterPreloadApi.check()).resolves.toMatchObject({ status: "up-to-date" });
    expect(mocks.invoke).toHaveBeenCalledWith(UPDATER_CHECK_CHANNEL);

    mocks.invoke.mockResolvedValueOnce({ automaticUpdates: false });
    await expect(updaterPreloadApi.setAutomaticUpdates(false)).resolves.toEqual({ automaticUpdates: false });
    expect(mocks.invoke).toHaveBeenCalledWith(UPDATER_SET_AUTOMATIC_CHANNEL, false);
  });

  it("validates subscribed state and removes the exact listener", () => {
    const listener = vi.fn();
    const cleanup = updaterPreloadApi.subscribe(listener);
    const handler = mocks.on.mock.calls[0]?.[1] as (event: unknown, value: unknown) => void;
    handler({}, { status: "ready", currentVersion: "0.1.0-beta.2", targetVersion: "0.1.0-beta.3" });
    expect(listener).toHaveBeenCalledWith({ status: "ready", currentVersion: "0.1.0-beta.2", targetVersion: "0.1.0-beta.3" });
    cleanup();
    expect(mocks.removeListener).toHaveBeenCalledWith(UPDATER_CHANGED_CHANNEL, handler);
  });
});
