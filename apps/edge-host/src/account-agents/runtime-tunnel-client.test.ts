import { FakeRuntimeAdapter } from "@agent-fabric/runtime-fake";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { AccountRuntimeTunnelClient } from "./runtime-tunnel-client.js";

describe("AccountRuntimeTunnelClient", () => {
  it("reconnects one established tunnel and ignores a stale socket close", async () => {
    const sockets: ControlledSocket[] = [];
    const client = createClient(sockets, 5);

    await client.start();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.sent.some((value) => value.includes('"type":"heartbeat"'))).toBe(true);

    sockets[0]?.remoteClose();
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    expect(sockets[1]?.sent.some((value) => value.includes('"type":"heartbeat"'))).toBe(true);

    sockets[0]?.emit("close", 1006, Buffer.alloc(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sockets).toHaveLength(2);

    await client.stop();
  });

  it("cancels a pending reconnect and shuts the executor down on explicit stop", async () => {
    const sockets: ControlledSocket[] = [];
    const adapter = new FakeRuntimeAdapter();
    const client = createClient(sockets, 50, adapter);
    const shutdown = vi.spyOn(client.executor, "shutdown");

    await client.start();
    sockets[0]?.remoteClose();
    await client.stop();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(sockets).toHaveLength(1);
    expect(shutdown).toHaveBeenCalledOnce();
  });
});

function createClient(sockets: ControlledSocket[], reconnectBaseMs: number, adapter = new FakeRuntimeAdapter()): AccountRuntimeTunnelClient {
  return new AccountRuntimeTunnelClient({
    server: "http://127.0.0.1:8787",
    accountSessionToken: "account-session-token",
    runtimeId: "runtime:one",
    workspaceRoot: "/private/project",
    adapter,
    reconnectBaseMs,
    reconnectMaxMs: reconnectBaseMs,
    heartbeatMs: 60_000,
    socketFactory: () => {
      const socket = new ControlledSocket();
      sockets.push(socket);
      queueMicrotask(() => socket.open());
      return socket as unknown as WebSocket;
    },
  });
}

class ControlledSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;
  readonly sent: string[] = [];

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.emit("open");
  }

  send(value: string): void { this.sent.push(value); }

  close(code = 1000): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.emit("close", code, Buffer.alloc(0));
  }

  remoteClose(): void { this.close(1006); }
}
