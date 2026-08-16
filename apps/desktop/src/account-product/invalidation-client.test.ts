import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountProductInvalidationClient, type AccountEventsSocket, type AccountEventsSocketFactory } from "./invalidation-client.js";

class FakeSocket implements AccountEventsSocket {
  readyState = 0;
  readonly listeners = new Map<string, ((value?: unknown) => void)[]>();
  readonly close = vi.fn(() => { this.emit("close"); });
  on(event: "open" | "message" | "close" | "error", listener: ((value?: unknown) => void)): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  emit(event: string, value?: unknown): void { for (const listener of this.listeners.get(event) ?? []) listener(value); }
}

afterEach(() => vi.useRealTimers());

describe("AccountProductInvalidationClient", () => {
  it("authenticates outside the URL, parses bounded events, and reconnects", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const connect = vi.fn((_url: string, _authorization: string) => {
      void _url;
      void _authorization;
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    });
    const onEvent = vi.fn();
    const onConnection = vi.fn();
    const client = new AccountProductInvalidationClient({
      serverBaseUrl: "https://fabric.example/base?bad=query", token: "account-session-secret",
      socketFactory: { connect } satisfies AccountEventsSocketFactory, onEvent, onConnection, retryDelay: () => 10,
    });
    client.start();
    expect(connect).toHaveBeenCalledWith("wss://fabric.example/v1/account-events", "Bearer account-session-secret");
    expect(String(connect.mock.calls[0]?.[0])).not.toContain("account-session-secret");
    sockets[0]?.emit("open");
    sockets[0]?.emit("message", JSON.stringify({ type: "account-resource-invalidated", accountId: "account:one", resourceType: "agent", resourceId: "agent:one", aspects: ["presence"], observedAt: "2026-08-13T00:00:00.000Z" }));
    expect(onConnection).toHaveBeenCalledWith("online");
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "agent:one", resourceType: "agent" }));
    sockets[0]?.emit("close");
    expect(onConnection).toHaveBeenCalledWith("reconnecting");
    await vi.advanceTimersByTimeAsync(10);
    expect(connect).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it("ignores invalid frames without reflecting their content", () => {
    const socket = new FakeSocket();
    const onEvent = vi.fn();
    const client = new AccountProductInvalidationClient({
      serverBaseUrl: "http://127.0.0.1:8787", token: "secret", socketFactory: { connect: () => socket }, onEvent,
    });
    client.start();
    socket.emit("message", "private-value-that-is-not-json");
    expect(onEvent).not.toHaveBeenCalled();
    client.stop();
  });

  it("replaces a half-open socket after its liveness deadline and ignores its delayed close", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const connect = vi.fn(() => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    });
    const onConnection = vi.fn();
    const client = new AccountProductInvalidationClient({
      serverBaseUrl: "https://fabric.example", token: "secret", socketFactory: { connect }, onEvent: vi.fn(), onConnection,
      retryDelay: () => 10, livenessTimeoutMs: 20,
    });
    client.start();
    sockets[0]?.emit("open");
    await vi.advanceTimersByTimeAsync(20);
    expect(sockets[0]?.close).toHaveBeenCalledWith(4000, "account-events-stale");
    expect(onConnection).toHaveBeenCalledWith("reconnecting");
    await vi.advanceTimersByTimeAsync(10);
    expect(connect).toHaveBeenCalledTimes(2);
    sockets[1]?.emit("open");
    sockets[0]?.emit("close");
    await vi.advanceTimersByTimeAsync(9);
    expect(connect).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it("resets the liveness deadline when a heartbeat frame arrives", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const client = new AccountProductInvalidationClient({
      serverBaseUrl: "https://fabric.example", token: "secret", socketFactory: { connect: () => socket }, onEvent: vi.fn(),
      retryDelay: () => 10, livenessTimeoutMs: 20,
    });
    client.start();
    socket.emit("open");
    await vi.advanceTimersByTimeAsync(15);
    socket.emit("message", JSON.stringify({ type: "account-events-heartbeat" }));
    await vi.advanceTimersByTimeAsync(15);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5);
    expect(socket.close).toHaveBeenCalledWith(4000, "account-events-stale");
    client.stop();
  });
});
