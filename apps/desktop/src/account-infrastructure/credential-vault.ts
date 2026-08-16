export type CredentialKind = "app-session" | "device" | "agent-host" | "mcp-local";

export interface SafeStoragePort {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface CredentialBlobStore {
  read(kind: CredentialKind): Promise<Buffer | undefined>;
  write(kind: CredentialKind, value: Buffer): Promise<void>;
  delete(kind: CredentialKind): Promise<void>;
}

export class SafeStorageCredentialVault {
  constructor(readonly safeStorage: SafeStoragePort, readonly blobs: CredentialBlobStore) {}

  async set(kind: CredentialKind, secret: string): Promise<void> {
    if (!secret) throw new Error("credential-empty");
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error("safe-storage-unavailable");
    await this.blobs.write(kind, this.safeStorage.encryptString(secret));
  }

  async get(kind: CredentialKind): Promise<string | undefined> {
    const encrypted = await this.blobs.read(kind);
    if (!encrypted) return undefined;
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error("safe-storage-unavailable");
    return this.safeStorage.decryptString(encrypted);
  }

  async delete(kind: CredentialKind): Promise<void> {
    await this.blobs.delete(kind);
  }

  async clearSession(): Promise<void> {
    await Promise.all((["app-session", "device", "agent-host", "mcp-local"] as const).map(async (kind) => this.blobs.delete(kind)));
  }
}
