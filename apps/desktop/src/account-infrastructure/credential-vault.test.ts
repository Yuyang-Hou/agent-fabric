import { describe, expect, it } from "vitest";

import { SafeStorageCredentialVault, type CredentialBlobStore } from "./credential-vault.js";

describe("safeStorage credential vault", () => {
  it("stores separate encrypted credential blobs and clears only session credentials", async () => {
    const values = new Map<string, Buffer>();
    const blobs: CredentialBlobStore = {
      read: async (kind) => values.get(kind),
      write: async (kind, value) => { values.set(kind, value); },
      delete: async (kind) => { values.delete(kind); },
    };
    const vault = new SafeStorageCredentialVault({
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`encrypted:${Buffer.from(value).toString("base64")}`),
      decryptString: (value) => Buffer.from(value.toString().slice("encrypted:".length), "base64").toString(),
    }, blobs);
    await vault.set("app-session", "app-secret");
    await vault.set("agent-host", "agent-secret");
    await vault.set("mcp-local", "mcp-secret");
    expect(Buffer.concat([...values.values()]).toString()).not.toMatch(/app-secret|agent-secret|mcp-secret/u);
    await expect(vault.get("app-session")).resolves.toBe("app-secret");
    await vault.clearSession();
    expect(values.size).toBe(0);
  });

  it("fails closed when operating-system encryption is unavailable", async () => {
    const vault = new SafeStorageCredentialVault({ isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => "" }, { read: async () => undefined, write: async () => undefined, delete: async () => undefined });
    await expect(vault.set("device", "secret")).rejects.toThrow("safe-storage-unavailable");
  });
});
