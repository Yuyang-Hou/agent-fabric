import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = "apps/desktop/src/account-product/agent-fabric-mark.tsx";
const appPath = "apps/desktop/src/account-product/app.tsx";
const releaseSvgPath = "apps/desktop/build-resources/agent-fabric-mark.svg";
const builderPath = "apps/desktop/electron-builder.yml";

test("keeps one mouthless Agent Fabric geometry across product and release assets", async () => {
  const [component, app, releaseSvg, builder] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(releaseSvgPath, "utf8"),
    readFile(builderPath, "utf8"),
  ]);
  const pathData = /AGENT_FABRIC_MARK_PATH = "([^"]+)"/u.exec(component)?.[1];

  assert.ok(pathData, "canonical in-product mark path missing");
  assert.match(releaseSvg, new RegExp(`d="${escapeRegExp(pathData)}"`, "u"));
  assert.match(releaseSvg, /fill-rule="evenodd"/u);
  assert.doesNotMatch(releaseSvg, /<circle|stroke-width|antenna|smile/iu);
  assert.doesNotMatch(app, /\bBot\b/u);
  assert.match(app, /AgentFabricMark/u);
  assert.match(builder, /icon:\s+build-resources\/icon\.icns/u);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
