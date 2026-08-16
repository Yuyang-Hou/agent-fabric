import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { refreshNotarizedUpdateAssets } from "./refresh-notarized-update-assets.mjs";
import { verifyUpdateAssets } from "./verify-update-assets.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopPackage = JSON.parse(await readFile(path.join(root, "apps", "desktop", "package.json"), "utf8"));
const version = desktopPackage.version;
const release = path.join(root, "apps", "desktop", "release");
const application = path.join(release, "mac-arm64", "Agent Fabric.app");
const executable = path.join(application, "Contents", "MacOS", "Agent Fabric");
const diskImage = path.join(release, `Agent-Fabric-${version}-arm64.dmg`);
const updateArchive = path.join(release, `Agent-Fabric-${version}-arm64.zip`);
const sourceIcon = path.join(root, "apps", "desktop", "build-resources", "icon.icns");
const packagedIcon = path.join(application, "Contents", "Resources", "icon.icns");
const infoPlist = path.join(application, "Contents", "Info.plist");

const codesignDetails = await checked("/usr/bin/codesign", ["-dv", "--verbose=4", application]);
assert.match(codesignDetails, /Identifier=ai\.agentfabric\.desktop(?:\n|$)/u, "unexpected Bundle ID");
assert.match(codesignDetails, /Authority=Developer ID Application:/u, "Developer ID Application authority missing");
assert.match(codesignDetails, /TeamIdentifier=(?!not set)([A-Z0-9]+)/u, "Team Identifier missing");
assert.match(codesignDetails, /flags=.*\bruntime\b/iu, "Hardened Runtime flag missing");

await checked("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", application]);
const architectures = (await checked("/usr/bin/lipo", ["-archs", executable])).trim().split(/\s+/u);
assert.deepEqual(architectures, ["arm64"], "release must be arm64-only");
assert.equal((await checked("/usr/bin/plutil", ["-extract", "CFBundleIconFile", "raw", "-o", "-", infoPlist])).trim(), "icon.icns");
assert.equal((await checked("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", infoPlist])).trim(), version);
assert.deepEqual(await readFile(packagedIcon), await readFile(sourceIcon), "packaged App icon does not match the release icon");
await checked("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", diskImage]);
await verifyDiskImageContents(diskImage);

const existingTicket = await optionalChecked("/usr/bin/xcrun", ["stapler", "validate", diskImage]);
if (!existingTicket) {
  const submission = JSON.parse(await checked("/usr/bin/xcrun", [
    "notarytool", "submit", diskImage,
    "--keychain-profile", "agent-fabric-notary",
    "--wait", "--output-format", "json",
  ]));
  assert.equal(submission.status, "Accepted", "Apple notarization did not accept the DMG");
  await checked("/usr/bin/xcrun", ["stapler", "staple", diskImage]);
}
await checked("/usr/bin/xcrun", ["stapler", "validate", diskImage]);
const gatekeeper = await checked("/usr/sbin/spctl", ["-a", "-vv", "-t", "install", diskImage]);
assert.match(gatekeeper, /accepted/iu, "Gatekeeper did not accept the DMG");
await refreshNotarizedUpdateAssets({ releaseDirectory: release, version });
await verifyUpdateAssets({ releaseDirectory: release, version });
await verifyUpdateArchiveContents(updateArchive);

console.log(JSON.stringify({
  status: "ok",
  product: "Agent Fabric",
  version,
  architecture: "arm64",
  bundleId: "ai.agentfabric.desktop",
  packagedReleaseIcon: true,
  developerIdApplication: true,
  teamIdentifierPresent: true,
  hardenedRuntime: true,
  notarization: "Accepted",
  stapledTicket: "valid",
  gatekeeper: "accepted",
  signedUpdateArchive: true,
  updateAssetConsistency: true,
}));

async function checked(command, arguments_) {
  try {
    const result = await execFileAsync(command, arguments_, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "unknown";
    throw new Error(`release-command-failed:${path.basename(command)}:${code}`);
  }
}

async function optionalChecked(command, arguments_) {
  try {
    return await checked(command, arguments_);
  } catch {
    return undefined;
  }
}

async function verifyDiskImageContents(sourceDiskImage) {
  const directory = await mkdtemp(path.join("/tmp", "agent-fabric-release-verify-"));
  const copiedDiskImage = path.join(directory, "Agent-Fabric.dmg");
  const mount = path.join(directory, "mounted");
  let mounted = false;
  try {
    await mkdir(mount);
    await copyFile(sourceDiskImage, copiedDiskImage);
    await checked("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, copiedDiskImage]);
    mounted = true;
    const mountedApplication = path.join(mount, "Agent Fabric.app");
    await checked("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", mountedApplication]);
    const mountedArchitectures = (await checked(
      "/usr/bin/lipo",
      ["-archs", path.join(mountedApplication, "Contents", "MacOS", "Agent Fabric")],
    )).trim().split(/\s+/u);
    assert.deepEqual(mountedArchitectures, ["arm64"], "DMG App must be arm64-only");
  } finally {
    if (mounted) await optionalChecked("/usr/bin/hdiutil", ["detach", mount, "-quiet"]);
    await rm(directory, { recursive: true, force: true });
  }
}

async function verifyUpdateArchiveContents(sourceArchive) {
  const directory = await mkdtemp(path.join("/tmp", "agent-fabric-update-verify-"));
  try {
    await checked("/usr/bin/ditto", ["-x", "-k", sourceArchive, directory]);
    const archivedApplication = path.join(directory, "Agent Fabric.app");
    await checked("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", archivedApplication]);
    const archivedArchitectures = (await checked(
      "/usr/bin/lipo",
      ["-archs", path.join(archivedApplication, "Contents", "MacOS", "Agent Fabric")],
    )).trim().split(/\s+/u);
    assert.deepEqual(archivedArchitectures, ["arm64"], "update ZIP App must be arm64-only");
    const gatekeeper = await checked("/usr/sbin/spctl", ["-a", "-vv", "-t", "exec", archivedApplication]);
    assert.match(gatekeeper, /accepted/iu, "Gatekeeper did not accept the update ZIP App");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
