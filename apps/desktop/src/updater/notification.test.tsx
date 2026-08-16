// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ElectronUpdaterApi, UpdaterState } from "./ipc.js";
import { AgentFabricUpdateNotification } from "./notification.js";

function updaterApi(initial: UpdaterState) {
  let listener: ((state: UpdaterState) => void) | undefined;
  const api: ElectronUpdaterApi = {
    snapshot: vi.fn(async () => initial),
    preferences: vi.fn(async () => ({ automaticUpdates: true })),
    setAutomaticUpdates: vi.fn(async (automaticUpdates) => ({ automaticUpdates })),
    check: vi.fn(async () => initial),
    install: vi.fn(async () => ({ status: "installing", currentVersion: "0.1.0-beta.2", targetVersion: "0.1.0-beta.3" })),
    subscribe: vi.fn((next) => { listener = next; return () => { listener = undefined; }; }),
  };
  return { api, emit: (state: UpdaterState) => listener?.(state) };
}

describe("Agent Fabric update notification", () => {
  it("renders a ready update, supports later, and preserves service state", async () => {
    const harness = updaterApi({ status: "ready", currentVersion: "0.1.0-beta.2", targetVersion: "0.1.0-beta.3", releaseNotes: "修复更新流程" });
    render(<AgentFabricUpdateNotification api={harness.api} />);
    expect(await screen.findByText("更新已就绪")).toBeTruthy();
    expect(screen.getByText("修复更新流程")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "稍后" }));
    expect(screen.queryByText("更新已就绪")).toBeNull();
    expect(harness.api.install).not.toHaveBeenCalled();
  });

  it("requests coordinated install and renders installing state from the service", async () => {
    const harness = updaterApi({ status: "ready", currentVersion: "0.1.0-beta.2", targetVersion: "0.1.0-beta.3" });
    render(<AgentFabricUpdateNotification api={harness.api} />);
    fireEvent.click(await screen.findByRole("button", { name: "重新启动并更新" }));
    expect(harness.api.install).toHaveBeenCalledOnce();

    act(() => harness.emit({ status: "installing", currentVersion: "0.1.0-beta.2", targetVersion: "0.1.0-beta.3" }));
    expect(screen.getByText("正在准备更新")).toBeTruthy();
  });
});
