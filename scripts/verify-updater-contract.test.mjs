import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pins one public packaged-only GitHub beta updater contract", async () => {
  const [builder, desktopPackageText, updaterMain, uploader, readbackWorkflow, releaseGatesText, boundariesText] = await Promise.all([
    readFile("apps/desktop/electron-builder.yml", "utf8"),
    readFile("apps/desktop/package.json", "utf8"),
    readFile("apps/desktop/src/updater/main.ts", "utf8"),
    readFile("scripts/upload-update-release-assets.mjs", "utf8"),
    readFile(".github/workflows/verify-draft-update-assets.yml", "utf8"),
    readFile("config/release-gates.json", "utf8"),
    readFile("config/package-boundaries.json", "utf8"),
  ]);
  const desktopPackage = JSON.parse(desktopPackageText);
  const releaseGates = JSON.parse(releaseGatesText);
  const boundaries = JSON.parse(boundariesText);

  assert.equal(desktopPackage.dependencies["electron-updater"], "6.8.9");
  assert.match(desktopPackage.scripts["package:mac"], /electron-builder --mac dmg zip --arm64/u);
  assert.match(desktopPackage.scripts["package:mac"], /--publish never/u);
  assert.match(builder, /target:\n\s+- dmg\n\s+- zip/u);
  assert.match(builder, /publish:\n\s+provider: github\n\s+owner: Yuyang-Hou\n\s+repo: agent-fabric\n\s+channel: beta\n\s+releaseType: draft/u);
  assert.doesNotMatch(builder, /\btoken:/iu);

  assert.match(updaterMain, /packaged: app\.isPackaged/u);
  assert.match(updaterMain, /autoInstallOnAppQuit = false/u);
  assert.match(updaterMain, /allowPrerelease = true/u);
  assert.match(updaterMain, /autoUpdater\.channel = "beta"/u);
  assert.match(updaterMain, /allowDowngrade = false/u);
  assert.doesNotMatch(updaterMain, /setFeedURL|process\.env\.[A-Z0-9_]*FEED|token\s*:/u);
  assert.match(uploader, /const repository = "Yuyang-Hou\/agent-fabric"/u);
  assert.match(uploader, /isDraft, true/u);
  assert.match(readbackWorkflow, /Agent-Fabric-\$\{RELEASE_VERSION\}-arm64\.dmg\.blockmap/u);
  assert.match(readbackWorkflow, /Agent-Fabric-\$\{RELEASE_VERSION\}-arm64\.zip\.blockmap/u);
  assert.match(readbackWorkflow, /node scripts\/verify-update-assets\.mjs/u);
  assert.match(readbackWorkflow, /node scripts\/verify-macos-release\.mjs/u);
  assert.doesNotMatch(readbackWorkflow, /APPLE_ID|CSC_LINK|CERTIFICATE_PASSWORD|notarytool store-credentials/u);
  assert.deepEqual(
    releaseGates.gates.find((gate) => gate.id === "trusted-macos-auto-update"),
    {
      id: "trusted-macos-auto-update",
      requiredFor: ["commercial-alpha"],
      status: "pending",
      evidence: "openspec/changes/multica-aligned-agents-product/tasks.md#21-implement-trusted-macos-desktop-auto-update",
    },
  );
  assert.deepEqual(
    boundaries.layers.find((layer) => layer.path === "apps/desktop").allowedImportExceptions,
    [
      { file: "src/updater/preferences.ts", imports: ["node:fs"] },
      { file: "src/updater/preferences.test.ts", imports: ["node:fs"] },
      { file: "src/updater/service.test.ts", imports: ["node:fs"] },
    ],
  );
});
