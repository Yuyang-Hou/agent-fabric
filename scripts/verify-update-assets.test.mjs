import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { expectedUpdateAssetNames, verifyUpdateAssets } from "./verify-update-assets.mjs";

test("accepts one internally consistent macOS beta update asset set", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-fabric-update-assets-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const version = "0.1.0-beta.3";
  const names = expectedUpdateAssetNames(version);
  const diskImage = Buffer.from("signed-dmg-fixture");
  const archive = Buffer.from("signed-agent-fabric-zip-fixture");
  const diskImageSha512 = createHash("sha512").update(diskImage).digest("base64");
  const sha512 = createHash("sha512").update(archive).digest("base64");
  await Promise.all([
    writeFile(path.join(directory, names.diskImage), diskImage),
    writeFile(path.join(directory, names.diskImageBlockmap), "dmg-blockmap-fixture"),
    writeFile(path.join(directory, names.archive), archive),
    writeFile(path.join(directory, names.blockmap), "blockmap-fixture"),
    writeFile(path.join(directory, names.metadata), metadata({ version, archive: names.archive, sha512, size: archive.length, diskImage: names.diskImage, diskImageSha512, diskImageSize: diskImage.length })),
  ]);

  const result = await verifyUpdateAssets({ releaseDirectory: directory, version });
  assert.deepEqual(result.assets, [names.diskImage, names.diskImageBlockmap, names.archive, names.blockmap, names.metadata]);
  assert.equal(result.archiveSha512, sha512);
});

test("rejects metadata whose digest does not match the uploaded ZIP", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-fabric-update-assets-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const version = "0.1.0-beta.3";
  const names = expectedUpdateAssetNames(version);
  const diskImage = Buffer.from("signed-dmg-fixture");
  const diskImageSha512 = createHash("sha512").update(diskImage).digest("base64");
  await Promise.all([
    writeFile(path.join(directory, names.diskImage), diskImage),
    writeFile(path.join(directory, names.diskImageBlockmap), "dmg-blockmap-fixture"),
    writeFile(path.join(directory, names.archive), "archive"),
    writeFile(path.join(directory, names.blockmap), "blockmap-fixture"),
    writeFile(path.join(directory, names.metadata), metadata({ version, archive: names.archive, sha512: Buffer.alloc(64).toString("base64"), size: 7, diskImage: names.diskImage, diskImageSha512, diskImageSize: diskImage.length })),
  ]);

  await assert.rejects(verifyUpdateAssets({ releaseDirectory: directory, version }), /sha512 mismatch/u);
});

test("rejects a latest-channel metadata file in place of the fixed beta channel", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-fabric-update-assets-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const version = "0.1.0-beta.3";
  const names = expectedUpdateAssetNames(version);
  await Promise.all([
    writeFile(path.join(directory, names.diskImage), "signed-dmg-fixture"),
    writeFile(path.join(directory, names.diskImageBlockmap), "dmg-blockmap-fixture"),
    writeFile(path.join(directory, names.archive), "archive"),
    writeFile(path.join(directory, names.blockmap), "blockmap-fixture"),
    writeFile(path.join(directory, "latest-mac.yml"), "version: 0.1.0-beta.3\n"),
  ]);

  await assert.rejects(verifyUpdateAssets({ releaseDirectory: directory, version }), /beta-mac\.yml/u);
});

test("rejects x64-named assets from the arm64 update set", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-fabric-update-assets-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const version = "0.1.0-beta.3";
  await Promise.all([
    writeFile(path.join(directory, `Agent-Fabric-${version}-x64.dmg`), "signed-dmg-fixture"),
    writeFile(path.join(directory, `Agent-Fabric-${version}-x64.dmg.blockmap`), "dmg-blockmap-fixture"),
    writeFile(path.join(directory, `Agent-Fabric-${version}-x64.zip`), "archive"),
    writeFile(path.join(directory, `Agent-Fabric-${version}-x64.zip.blockmap`), "blockmap-fixture"),
    writeFile(path.join(directory, "beta-mac.yml"), "version: 0.1.0-beta.3\n"),
  ]);

  await assert.rejects(verifyUpdateAssets({ releaseDirectory: directory, version }), /arm64\.(?:dmg|zip)/u);
});

function metadata({ version, archive, sha512, size, diskImage, diskImageSha512, diskImageSize }) {
  return `version: ${version}\nfiles:\n  - url: ${archive}\n    sha512: ${sha512}\n    size: ${size}\n  - url: ${diskImage}\n    sha512: ${diskImageSha512}\n    size: ${diskImageSize}\npath: ${archive}\nsha512: ${sha512}\nreleaseDate: '2026-08-16T00:00:00.000Z'\n`;
}
