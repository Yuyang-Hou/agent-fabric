import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { verifyUpdateAssets } from "./verify-update-assets.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopPackage = JSON.parse(await readFile(path.join(root, "apps", "desktop", "package.json"), "utf8"));
const version = desktopPackage.version;
const tag = `v${version}`;
const repository = "Yuyang-Hou/agent-fabric";
const releaseDirectory = path.join(root, "apps", "desktop", "release");
const verified = await verifyUpdateAssets({ releaseDirectory, version });
const assetPaths = verified.assets.map((name) => path.join(releaseDirectory, name));

const before = await releaseView();
assert.equal(before.isDraft, true, "update assets may only be uploaded to an existing draft release");
assert.equal(before.isPrerelease, true, "beta update release must be marked as a prerelease");
const existingNames = new Set(before.assets.map((asset) => asset.name));
for (const name of verified.assets) assert.equal(existingNames.has(name), false, `draft already contains ${name}`);

try {
  await gh(["release", "upload", tag, ...assetPaths, "--repo", repository]);
  const after = await releaseView();
  for (let index = 0; index < verified.assets.length; index += 1) {
    const name = verified.assets[index];
    const uploaded = after.assets.find((asset) => asset.name === name);
    assert.ok(uploaded, `draft readback is missing ${name}`);
    const expectedSizes = [verified.sizes.diskImage, verified.sizes.diskImageBlockmap, verified.sizes.archive, verified.sizes.blockmap, verified.sizes.metadata];
    assert.equal(uploaded.size, expectedSizes[index], `draft readback size mismatch for ${name}`);
  }
} catch (error) {
  await Promise.all(verified.assets.map((name) => gh(["release", "delete-asset", tag, name, "--repo", repository, "--yes"]).catch(() => undefined)));
  throw error;
}

console.log(JSON.stringify({ status: "uploaded-and-read-back", repository, tag, assets: verified.assets, releaseRemainsDraft: true }));

async function releaseView() {
  const output = await gh(["release", "view", tag, "--repo", repository, "--json", "isDraft,isPrerelease,assets"]);
  const value = JSON.parse(output);
  assert.ok(Array.isArray(value.assets), "invalid GitHub release asset response");
  return value;
}

async function gh(arguments_) {
  try {
    const result = await execFileAsync("gh", arguments_, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return result.stdout;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "unknown";
    throw new Error(`github-release-command-failed:${arguments_[0]}:${arguments_[1] ?? "unknown"}:${code}`);
  }
}
