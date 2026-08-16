import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const allowedKinds = new Set(["app-session", "device", "agent-host", "mcp-local"]);

export class FileCredentialBlobStore {
  constructor(readonly directory: string) {}

  async read(kind: "app-session" | "device" | "agent-host" | "mcp-local"): Promise<Buffer | undefined> {
    validateKind(kind);
    try { return await readFile(join(this.directory, `${kind}.safe-storage`)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }

  async write(kind: "app-session" | "device" | "agent-host" | "mcp-local", value: Buffer): Promise<void> {
    validateKind(kind);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const destination = join(this.directory, `${kind}.safe-storage`);
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, value, { mode: 0o600 });
    await rename(temporary, destination);
  }

  async delete(kind: "app-session" | "device" | "agent-host" | "mcp-local"): Promise<void> {
    validateKind(kind);
    await rm(join(this.directory, `${kind}.safe-storage`), { force: true });
  }
}

function validateKind(kind: string): void {
  if (!allowedKinds.has(kind)) throw new Error("credential-kind-invalid");
}
