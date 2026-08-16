import { describe, expect, it, vi } from "vitest";

import { AccountInvalidationHub } from "./account-invalidation.js";

describe("AccountInvalidationHub", () => {
  it("publishes only to the matching Account and removes disconnected subscribers", () => {
    const hub = new AccountInvalidationHub();
    const one = { readyState: 1, send: vi.fn() };
    const two = { readyState: 1, send: vi.fn() };
    const unregister = hub.register("account:one", one);
    hub.register("account:two", two);
    const event = { type: "account-resource-invalidated", accountId: "account:one", resourceType: "agent", resourceId: "agent:one", aspects: ["workload", "activity"], observedAt: "2026-08-13T00:00:00.000Z" } satisfies Parameters<AccountInvalidationHub["publish"]>[0];
    hub.publish(event);
    expect(one.send).toHaveBeenCalledWith(JSON.stringify(event));
    expect(two.send).not.toHaveBeenCalled();
    unregister();
    hub.publish(event);
    expect(one.send).toHaveBeenCalledTimes(1);
  });

  it("does not deliver to a non-open transport", () => {
    const hub = new AccountInvalidationHub();
    const transport = { readyState: 3, send: vi.fn() };
    hub.register("account:one", transport);
    hub.publish({ type: "account-resource-invalidated", accountId: "account:one", resourceType: "runtime", resourceId: "runtime:one", aspects: ["runtime", "presence"], observedAt: "2026-08-13T00:00:00.000Z" });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("delivers friend invalidations only to the matching Human across Account boundaries", () => {
    const hub = new AccountInvalidationHub();
    const bob = { readyState: 1, send: vi.fn() };
    const carol = { readyState: 1, send: vi.fn() };
    hub.register("account:bob", bob, "human:bob");
    hub.register("account:carol", carol, "human:carol");
    const event = { type: "human-resource-invalidated", userId: "human:bob", resourceType: "friend-agent", resourceId: "agent:alice", aspects: ["access"], observedAt: "2026-08-13T00:00:00.000Z" } satisfies Parameters<AccountInvalidationHub["publish"]>[0];
    hub.publish(event);
    expect(bob.send).toHaveBeenCalledWith(JSON.stringify(event));
    expect(carol.send).not.toHaveBeenCalled();
  });
});
