import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { refreshNotarizedUpdateAssets } from "./refresh-notarized-update-assets.mjs";
import { expectedUpdateAssetNames, verifyUpdateAssets } from "./verify-update-assets.mjs";

test("refreshes DMG blockmap and update metadata after Staple changes the DMG", async () => {
  const version = "0.1.0-beta.3";
  const directory = await mkdtemp(path.join(tmpdir(), "agent-fabric-notarized-assets-"));
  const names = expectedUpdateAssetNames(version);
  await Promise.all([
    writeFile(path.join(directory, names.archive), "signed update archive"),
    writeFile(path.join(directory, names.blockmap), "archive blockmap"),
    writeFile(path.join(directory, names.diskImage), "notarized and stapled disk image"),
    writeFile(path.join(directory, names.diskImageBlockmap), "stale disk image blockmap"),
    writeFile(path.join(directory, names.metadata), `version: ${version}\nfiles:\n  - url: ${names.archive}\n    sha512: stale\n    size: 1\n  - url: ${names.diskImage}\n    sha512: stale\n    size: 1\npath: ${names.archive}\nsha512: stale\nreleaseDate: '2026-08-16T00:00:00.000Z'\n`),
  ]);

  await refreshNotarizedUpdateAssets({ releaseDirectory: directory, version });

  const verified = await verifyUpdateAssets({ releaseDirectory: directory, version });
  assert.equal(verified.status, "ok");
  assert.ok(verified.sizes.diskImageBlockmap > "stale disk image blockmap".length);
});
