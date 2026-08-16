import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_UPDATER_PREFERENCES, loadUpdaterPreferences, saveUpdaterPreferences } from "./preferences.js";

const directories: string[] = [];

async function preferencePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-updater-preferences-"));
  directories.push(directory);
  return join(directory, "nested", "preferences.json");
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Desktop updater preferences", () => {
  it("defaults safely when the file is missing or malformed", async () => {
    const missing = await preferencePath();
    const malformed = await preferencePath();
    await mkdir(join(malformed, ".."), { recursive: true });
    await writeFile(malformed, JSON.stringify({ automaticUpdates: "yes" }), "utf8");

    await expect(loadUpdaterPreferences(missing)).resolves.toEqual(DEFAULT_UPDATER_PREFERENCES);
    await expect(loadUpdaterPreferences(malformed)).resolves.toEqual(DEFAULT_UPDATER_PREFERENCES);
  });

  it("atomically round-trips a disabled preference", async () => {
    const filePath = await preferencePath();
    await saveUpdaterPreferences(filePath, { automaticUpdates: false });

    await expect(loadUpdaterPreferences(filePath)).resolves.toEqual({ automaticUpdates: false });
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({ automaticUpdates: false });
  });

  it("keeps concurrent atomic saves valid", async () => {
    const filePath = await preferencePath();
    await Promise.all([
      saveUpdaterPreferences(filePath, { automaticUpdates: false }),
      saveUpdaterPreferences(filePath, { automaticUpdates: true }),
    ]);

    const saved = await loadUpdaterPreferences(filePath);
    expect([true, false]).toContain(saved.automaticUpdates);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(saved);
  });
});
