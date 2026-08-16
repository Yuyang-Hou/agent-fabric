import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function expectedUpdateAssetNames(version) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/u, "invalid release version");
  const archive = `Agent-Fabric-${version}-arm64.zip`;
  const diskImage = `Agent-Fabric-${version}-arm64.dmg`;
  return Object.freeze({
    diskImage,
    diskImageBlockmap: `${diskImage}.blockmap`,
    archive,
    blockmap: `${archive}.blockmap`,
    metadata: "beta-mac.yml",
  });
}

export async function verifyUpdateAssets({ releaseDirectory, version }) {
  const names = expectedUpdateAssetNames(version);
  const files = Object.fromEntries(Object.entries(names).map(([kind, name]) => [kind, path.join(releaseDirectory, name)]));
  const [diskImage, diskImageBlockmap, archive, blockmap, metadataFile, metadataText] = await Promise.all([
    nonEmptyFile(files.diskImage),
    nonEmptyFile(files.diskImageBlockmap),
    nonEmptyFile(files.archive),
    nonEmptyFile(files.blockmap),
    nonEmptyFile(files.metadata),
    readFile(files.metadata, "utf8"),
  ]);
  assert.ok(metadataText.length > 0, "update metadata must not be empty");

  const metadata = parseMacUpdateMetadata(metadataText, names.archive, names.diskImage);
  const [archiveSha512, diskImageSha512] = await Promise.all([sha512Base64(files.archive), sha512Base64(files.diskImage)]);
  assert.equal(metadata.version, version, "update metadata version mismatch");
  assert.equal(metadata.path, names.archive, "update metadata path must reference the release ZIP");
  assert.equal(metadata.fileUrl, names.archive, "update metadata files entry must reference the release ZIP");
  assert.equal(metadata.sha512, archiveSha512, "update metadata top-level sha512 mismatch");
  assert.equal(metadata.fileSha512, archiveSha512, "update metadata files sha512 mismatch");
  assert.equal(metadata.fileSize, archive.size, "update metadata ZIP size mismatch");
  assert.equal(metadata.diskImageSha512, diskImageSha512, "update metadata DMG sha512 mismatch");
  assert.equal(metadata.diskImageSize, diskImage.size, "update metadata DMG size mismatch");

  return Object.freeze({
    status: "ok",
    version,
    assets: [names.diskImage, names.diskImageBlockmap, names.archive, names.blockmap, names.metadata],
    sizes: { diskImage: diskImage.size, diskImageBlockmap: diskImageBlockmap.size, archive: archive.size, blockmap: blockmap.size, metadata: metadataFile.size },
    archiveSha512,
    diskImageSha512,
  });
}

export function parseMacUpdateMetadata(text, expectedArchive, expectedDiskImage) {
  const lines = text.split(/\r?\n/u);
  const topLevel = new Map();
  const fileEntries = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const topMatch = /^(version|path|sha512):\s*(.+?)\s*$/u.exec(line);
    if (topMatch) topLevel.set(topMatch[1], yamlScalar(topMatch[2]));

    const urlMatch = /^\s*-\s+url:\s*(.+?)\s*$/u.exec(line);
    if (!urlMatch) continue;
    const fileUrl = yamlScalar(urlMatch[1]);
    if (fileUrl !== expectedArchive && fileUrl !== expectedDiskImage) continue;
    const entry = {};
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^\s*-\s+/u.test(lines[cursor])) break;
      const field = /^\s+(sha512|size):\s*(.+?)\s*$/u.exec(lines[cursor]);
      if (field) entry[field[1]] = yamlScalar(field[2]);
    }
    fileEntries.set(fileUrl, entry);
  }

  const archiveEntry = fileEntries.get(expectedArchive);
  const diskImageEntry = fileEntries.get(expectedDiskImage);
  assert.ok(archiveEntry, "update metadata is missing the release ZIP files entry");
  assert.ok(diskImageEntry, "update metadata is missing the release DMG files entry");
  assert.match(topLevel.get("sha512") ?? "", /^[A-Za-z0-9+/]+={0,2}$/u, "invalid top-level sha512");
  assert.match(archiveEntry.sha512 ?? "", /^[A-Za-z0-9+/]+={0,2}$/u, "invalid files sha512");
  assert.match(diskImageEntry.sha512 ?? "", /^[A-Za-z0-9+/]+={0,2}$/u, "invalid DMG sha512");
  const fileSize = Number(archiveEntry.size);
  const diskImageSize = Number(diskImageEntry.size);
  assert.ok(Number.isSafeInteger(fileSize) && fileSize > 0, "invalid update ZIP size");
  assert.ok(Number.isSafeInteger(diskImageSize) && diskImageSize > 0, "invalid update DMG size");
  return {
    version: topLevel.get("version"),
    path: topLevel.get("path"),
    sha512: topLevel.get("sha512"),
    fileUrl: expectedArchive,
    fileSha512: archiveEntry.sha512,
    fileSize,
    diskImageSha512: diskImageEntry.sha512,
    diskImageSize,
  };
}

async function nonEmptyFile(filePath) {
  const details = await stat(filePath);
  assert.ok(details.isFile() && details.size > 0, `${path.basename(filePath)} must be a non-empty file`);
  return details;
}

async function sha512Base64(filePath) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("base64");
}

function yamlScalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const desktopPackage = JSON.parse(await readFile(path.join(root, "apps", "desktop", "package.json"), "utf8"));
  const result = await verifyUpdateAssets({ releaseDirectory: path.join(root, "apps", "desktop", "release"), version: desktopPackage.version });
  console.log(JSON.stringify(result));
}
