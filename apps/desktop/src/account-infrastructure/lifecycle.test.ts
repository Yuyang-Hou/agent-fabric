import { describe, expect, it, vi } from "vitest";

import { DesktopHostLifecycle } from "./lifecycle.js";

describe("Desktop Agent Host lifecycle", () => {
  it("hides a macOS window without stopping the Host, but not during full quit", () => {
    const lifecycle = new DesktopHostLifecycle();
    expect(lifecycle.shouldHideWindow("darwin")).toBe(true);
    expect(lifecycle.shouldHideWindow("linux")).toBe(false);
    lifecycle.requestFullQuit(async () => undefined, () => undefined);
    expect(lifecycle.shouldHideWindow("darwin")).toBe(false);
  });

  it("waits for Host shutdown exactly once before allowing Electron to quit", async () => {
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const shutdown = vi.fn(() => pending);
    const finish = vi.fn();
    const lifecycle = new DesktopHostLifecycle();
    expect(lifecycle.requestFullQuit(shutdown, finish)).toBe("wait");
    expect(lifecycle.requestFullQuit(shutdown, finish)).toBe("wait");
    expect(shutdown).toHaveBeenCalledOnce();
    release();
    await pending;
    await vi.waitFor(() => expect(finish).toHaveBeenCalledOnce());
    expect(lifecycle.requestFullQuit(shutdown, finish)).toBe("allow");
  });

  it("fails closed for an update install when Host shutdown fails", async () => {
    const failure = new Error("private shutdown detail");
    const finish = vi.fn();
    const onFailure = vi.fn();
    const lifecycle = new DesktopHostLifecycle();

    expect(lifecycle.requestFullQuit(async () => { throw failure; }, finish, onFailure)).toBe("wait");

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledWith(failure));
    expect(finish).not.toHaveBeenCalled();
    expect(lifecycle.quitting).toBe(false);
    expect(lifecycle.shouldHideWindow("darwin")).toBe(true);
  });
});
