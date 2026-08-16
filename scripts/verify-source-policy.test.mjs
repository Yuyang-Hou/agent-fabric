import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findForbiddenProductSource, validateLedger, validateManifest } from "./verify-source-policy.mjs";

function candidate(overrides = {}) {
  return {
    id: "sample",
    project: "Sample",
    repository: "https://example.com/sample",
    pinnedRef: "1111111111111111111111111111111111111111",
    license: "MIT",
    licensePolicy: "permissive",
    adoptionStatus: "candidate",
    packageNames: ["sample-package"],
    usage: "test",
    noticeRequirement: "preserve-on-adoption",
    noticeFile: null,
    replacementBoundary: "SamplePort",
    localModifications: "None",
    ...overrides,
  };
}

test("accepts a complete pinned candidate", () => {
  assert.deepEqual(validateLedger({ schemaVersion: 1, entries: [candidate()] }, process.cwd()), []);
});

test("rejects approved source without its required notice", () => {
  const errors = validateLedger(
    { schemaVersion: 1, entries: [candidate({ adoptionStatus: "approved" })] },
    process.cwd(),
  );
  assert.ok(errors.some((error) => error.includes("missing noticeFile")));
});

test("rejects a restricted source promoted into product code", () => {
  const errors = validateLedger(
    {
      schemaVersion: 1,
      entries: [candidate({ licensePolicy: "forbidden-product-code", adoptionStatus: "approved" })],
    },
    process.cwd(),
  );
  assert.ok(errors.some((error) => error.includes("reference-only")));
});

test("requires a forbidden research source to carry external evidence and an in-repo record", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-fabric-source-policy-"));
  const errors = validateLedger(
    {
      schemaVersion: 1,
      entries: [candidate({ licensePolicy: "forbidden-product-code", adoptionStatus: "reference-only" })],
    },
    root,
  );
  assert.ok(errors.some((error) => error.includes("researchCheckout")));
  assert.ok(errors.some((error) => error.includes("researchEvidence")));
  assert.ok(errors.some((error) => error.includes("researchRecord")));
});

test("rejects unregistered package dependencies", () => {
  const ledger = { schemaVersion: 1, entries: [candidate()] };
  const errors = validateManifest({ dependencies: { "unknown-package": "1.0.0" } }, ledger, "package.json");
  assert.deepEqual(errors, ["package.json: unregistered dependency unknown-package"]);
});

test("detects direct Multica source markers in product roots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-fabric-source-policy-"));
  fs.mkdirSync(path.join(root, "packages", "bad"), { recursive: true });
  fs.writeFileSync(path.join(root, "packages", "bad", "index.ts"), 'import "@multica/core";\n');
  assert.equal(findForbiddenProductSource(root).length, 1);
});

test("detects Multica branding in styles and copied asset paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-fabric-source-policy-"));
  fs.mkdirSync(path.join(root, "apps", "desktop", "assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "apps", "desktop", "theme.css"), '/* built on Multica */\n');
  fs.writeFileSync(path.join(root, "apps", "desktop", "assets", "multica-logo.svg"), "<svg />\n");
  assert.equal(findForbiddenProductSource(root).length, 2);
});

test("detects copied Multica component names, tokens, issue markers and private routes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-fabric-source-policy-"));
  fs.mkdirSync(path.join(root, "apps", "desktop"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "apps", "desktop", "copied.tsx"),
    'const view = CollectionPageHeader; const css = "--agc-runtime"; const route = "/api/agent-builder/sessions"; // MUL-5438\n',
  );
  assert.equal(findForbiddenProductSource(root).length, 1);
});

test("detects a Multica research-checkout path copied into product source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-fabric-source-policy-"));
  fs.mkdirSync(path.join(root, "packages", "catalog"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "packages", "catalog", "evidence.ts"),
    'export const source = "/Users/dev/project/multica/packages/views/agents";\n',
  );
  assert.equal(findForbiddenProductSource(root).length, 1);
});

test("detects frozen Demo API or Store markers in product roots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-fabric-source-policy-"));
  fs.mkdirSync(path.join(root, "apps", "edge-host"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "apps", "edge-host", "legacy.ts"),
    'export const endpoint = "/api/tasks";\nclass DemoTaskStore {}\n',
  );

  const errors = findForbiddenProductSource(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /legacy\.ts/);
});
