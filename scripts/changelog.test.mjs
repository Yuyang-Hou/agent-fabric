import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ChangelogError,
  checkRepository,
  parseEntry,
  prepareRepository,
  previewRepository,
  renderSection,
} from "./changelog.mjs";

const firstRelease = `## [0.1.0-beta.1] - 2026-08-14

### ✨ 新增

- 首个用户可见版本。
`;

test("parses the bounded entry format and renders categories deterministically", () => {
  const added = parseEntry("category: added\n\n支持创建多个智能体。\n", "multi-agent.md");
  const fixed = parseEntry("category: fixed\n\n修复登录完成后无法进入产品的问题。\n", "login-recovery.md");
  assert.equal(added.category, "added");
  assert.equal(renderSection("0.1.0-beta.2", "2026-08-15", [fixed, added]), `## [0.1.0-beta.2] - 2026-08-15

### ✨ 新增

- 支持创建多个智能体。

### 🐛 修复

- 修复登录完成后无法进入产品的问题。
`);
});

test("rejects malformed and sensitive entries without echoing their content", () => {
  assert.throws(() => parseEntry("category: unknown\n\n这是一条错误分类。", "bad.md"), error("changelog-entry-category-invalid:bad.md"));
  assert.throws(() => parseEntry("category: fixed\n\n修复 /Users/example/private 下的读取问题。", "path.md"), error("changelog-entry-sensitive:path.md"));
  assert.throws(() => parseEntry("category: fixed\n\ntoken=secret-value", "secret.md"), error("changelog-entry-sensitive:secret.md"));
});

test("checks historical release bodies against the persistent changelog", async () => {
  const root = await fixture({ version: "0.1.0-beta.1" });
  assert.deepEqual(await checkRepository(root), {
    status: "ok",
    packageVersion: "0.1.0-beta.1",
    unreleasedEntries: 0,
    historicalReleases: 1,
  });
  await writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n", "utf8");
  await assert.rejects(checkRepository(root), error("changelog-release-history-mismatch:0.1.0-beta.1"));
});

test("previews and prepares a release while preserving the exact body in history", async () => {
  const root = await fixture({
    version: "0.1.0-beta.2",
    entries: {
      "agent-search.md": "category: changed\n\n智能体搜索现在会同时匹配名称和描述。\n",
      "login-recovery.md": "category: fixed\n\n修复浏览器登录完成后桌面端无法恢复会话的问题。\n",
    },
  });
  const preview = await previewRepository(root, { version: "0.1.0-beta.2", date: "2026-08-15" });
  const result = await prepareRepository(root, "0.1.0-beta.2", { date: "2026-08-15" });
  assert.deepEqual(result, { status: "prepared", version: "0.1.0-beta.2", releaseNotes: "changelog/releases/0.1.0-beta.2.md", entries: 2 });
  assert.equal(await readFile(path.join(root, result.releaseNotes), "utf8"), preview);
  assert.equal((await readFile(path.join(root, "CHANGELOG.md"), "utf8")).includes(preview.trim()), true);
  assert.deepEqual(await readdir(path.join(root, "changelog", "unreleased")), []);
  assert.deepEqual((await readdir(path.join(root, "changelog", "archive", "0.1.0-beta.2"))).sort(), ["agent-search.md", "login-recovery.md"]);
  assert.equal((await checkRepository(root)).historicalReleases, 2);
});

test("invalid preparation never consumes or changes repository inputs", async (t) => {
  const cases = [
    { name: "package mismatch", fixture: { version: "0.1.0-beta.1", entries: { "one.md": "category: added\n\n新增一个可见能力。\n" } }, version: "0.1.0-beta.2", code: "changelog-package-version-mismatch" },
    { name: "duplicate version", fixture: { version: "0.1.0-beta.1", entries: { "one.md": "category: added\n\n新增一个可见能力。\n" } }, version: "0.1.0-beta.1", code: "changelog-version-exists" },
    { name: "empty release", fixture: { version: "0.1.0-beta.2" }, version: "0.1.0-beta.2", code: "changelog-release-empty" },
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const root = await fixture(item.fixture);
    const before = await treeSnapshot(root);
    await assert.rejects(prepareRepository(root, item.version, { date: "2026-08-15" }), error(item.code));
    assert.deepEqual(await treeSnapshot(root), before);
  });
});

test("a malformed entry fails check without mutating files", async () => {
  const root = await fixture({ version: "0.1.0-beta.2", entries: { "bad.md": "category: fixed\n\nline one\nline two\n" } });
  const before = await treeSnapshot(root);
  await assert.rejects(checkRepository(root), error("changelog-entry-format-invalid:bad.md"));
  assert.deepEqual(await treeSnapshot(root), before);
});

async function fixture({ version, entries = {} }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-fabric-changelog-"));
  await mkdir(path.join(root, "apps", "desktop"), { recursive: true });
  await mkdir(path.join(root, "changelog", "unreleased"), { recursive: true });
  await mkdir(path.join(root, "changelog", "releases"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ version }), "utf8");
  await writeFile(path.join(root, "apps", "desktop", "package.json"), JSON.stringify({ version }), "utf8");
  await writeFile(path.join(root, "changelog", "releases", "0.1.0-beta.1.md"), firstRelease, "utf8");
  await writeFile(path.join(root, "CHANGELOG.md"), `# Changelog\n\n## [Unreleased]\n\n${firstRelease}`, "utf8");
  for (const [name, content] of Object.entries(entries)) await writeFile(path.join(root, "changelog", "unreleased", name), content, "utf8");
  return root;
}

async function treeSnapshot(root) {
  const result = {};
  await walk(root, "", result);
  return result;
}

async function walk(root, relative, result) {
  const current = path.join(root, relative);
  for (const name of (await readdir(current)).sort()) {
    const child = path.join(relative, name);
    const details = await stat(path.join(root, child));
    if (details.isDirectory()) await walk(root, child, result);
    else result[child] = await readFile(path.join(root, child), "utf8");
  }
}

function error(message) {
  return (value) => value instanceof ChangelogError && value.message === message;
}
