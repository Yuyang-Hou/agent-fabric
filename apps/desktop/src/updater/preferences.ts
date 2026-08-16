import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { updaterPreferencesSchema, type UpdaterPreferences } from "./ipc.js";

export const DEFAULT_UPDATER_PREFERENCES: UpdaterPreferences = Object.freeze({ automaticUpdates: true });

export async function loadUpdaterPreferences(filePath: string): Promise<UpdaterPreferences> {
  try {
    return updaterPreferencesSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
  } catch {
    return { ...DEFAULT_UPDATER_PREFERENCES };
  }
}

export async function saveUpdaterPreferences(filePath: string, preferences: UpdaterPreferences): Promise<void> {
  const validated = updaterPreferencesSchema.parse(preferences);
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
