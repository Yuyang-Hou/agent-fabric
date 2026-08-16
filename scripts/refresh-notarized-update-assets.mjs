import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expectedUpdateAssetNames } from "./verify-update-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromDesktop = createRequire(path.join(root, "apps", "desktop", "package.json"));
const requireFromElectronBuilder = createRequire(requireFromDesktop.resolve("electron-builder/package.json"));
const { buildBlockMap } = requireFromElectronBuilder("app-builder-lib/out/targets/blockmap/blockmap");

export async function refreshNotarizedUpdateAssets({ releaseDirectory, version }) {
  const names = expectedUpdateAssetNames(version);
  const diskImage = path.join(releaseDirectory, names.diskImage);
  const diskImageBlockmap = path.join(releaseDirectory, names.diskImageBlockmap);
  const archive = path.join(releaseDirectory, names.archive);
  const metadata = path.join(releaseDirectory, names.metadata);
  const existingMetadata = await readFile(metadata, "utf8");
  const releaseDate = metadataReleaseDate(existingMetadata);
  const [diskImageInfo, archiveInfo, archiveSha512] = await Promise.all([
    buildBlockMap(diskImage, "gzip", diskImageBlockmap),
    stat(archive),
    sha512Base64(archive),
  ]);
  assert.ok(Number.isSafeInteger(diskImageInfo.size) && diskImageInfo.size > 0 && typeof diskImageInfo.sha512 === "string");
  assert.ok(archiveInfo.isFile() && archiveInfo.size > 0);
  const nextMetadata = [
    `version: ${version}`,
    "files:",
    `  - url: ${names.archive}`,
    `    sha512: ${archiveSha512}`,
    `    size: ${archiveInfo.size}`,
    `  - url: ${names.diskImage}`,
    `    sha512: ${diskImageInfo.sha512}`,
    `    size: ${diskImageInfo.size}`,
    `path: ${names.archive}`,
    `sha512: ${archiveSha512}`,
    `releaseDate: '${releaseDate}'`,
    "",
  ].join("\n");
  const temporaryMetadata = `${metadata}.tmp`;
  await writeFile(temporaryMetadata, nextMetadata, "utf8");
  await rename(temporaryMetadata, metadata);
  return Object.freeze({ diskImageSha512: diskImageInfo.sha512, diskImageSize: diskImageInfo.size, releaseDate });
}

function metadataReleaseDate(source) {
  const match = /^releaseDate:\s*['"]?([^'"\r\n]+)['"]?\s*$/mu.exec(source);
  assert.ok(match?.[1] && Number.isFinite(Date.parse(match[1])), "update metadata releaseDate missing or invalid");
  return new Date(match[1]).toISOString();
}

async function sha512Base64(filePath) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("base64");
}
