import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const categories = Object.freeze([
  { id: "breaking", title: "⚠️ 破坏性变更" },
  { id: "added", title: "✨ 新增" },
  { id: "changed", title: "🔧 改进" },
  { id: "fixed", title: "🐛 修复" },
  { id: "security", title: "🔒 安全" },
]);

const categoryIds = new Set(categories.map((category) => category.id));
const entryFilePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const sensitivePatterns = [
  /(?:^|\s)(?:\/Users\/|\/home\/|\/private\/|[A-Za-z]:\\)/u,
  /\b(?:bearer|oauth|password|token|client[_ -]?secret|refresh[_ -]?token|access[_ -]?token)\b/iu,
  /\b(?:gh[opsu]_|sk-)[A-Za-z0-9_-]+/u,
  /\b(?:credential|runtime|session|principal|grant):[A-Za-z0-9._:-]+/iu,
  /\b(?:TeamIdentifier|Developer ID Application:|SHA-?1)\b/iu,
];

export class ChangelogError extends Error {
  constructor(code) {
    super(code);
    this.name = "ChangelogError";
  }
}

export function parseEntry(source, filename = "entry.md") {
  if (!entryFilePattern.test(filename)) throw new ChangelogError(`changelog-entry-filename-invalid:${safeFilename(filename)}`);
  const normalized = source.replace(/\r\n/gu, "\n").trim();
  const match = /^category: ([a-z]+)\n\n([^\n]+)$/u.exec(normalized);
  if (!match) throw new ChangelogError(`changelog-entry-format-invalid:${safeFilename(filename)}`);
  const [, category, summary] = match;
  if (!categoryIds.has(category)) throw new ChangelogError(`changelog-entry-category-invalid:${safeFilename(filename)}`);
  const text = summary.trim();
  if (text.length < 6 || text.length > 240 || /^[-#>*]/u.test(text)) throw new ChangelogError(`changelog-entry-summary-invalid:${safeFilename(filename)}`);
  if (sensitivePatterns.some((pattern) => pattern.test(text))) throw new ChangelogError(`changelog-entry-sensitive:${safeFilename(filename)}`);
  return Object.freeze({ filename, category, summary: text });
}

export function renderSection(version, date, entries) {
  if (!versionPattern.test(version)) throw new ChangelogError("changelog-version-invalid");
  if (!datePattern.test(date)) throw new ChangelogError("changelog-date-invalid");
  return renderCategorizedSection(`## [${version}] - ${date}`, entries);
}

export function renderUnreleased(entries) {
  return renderCategorizedSection("## [Unreleased]", entries);
}

function renderCategorizedSection(heading, entries) {
  if (entries.length === 0) throw new ChangelogError("changelog-release-empty");
  const lines = [heading, ""];
  for (const category of categories) {
    const matching = entries.filter((entry) => entry.category === category.id).sort(compareEntries);
    if (matching.length === 0) continue;
    lines.push(`### ${category.title}`, "", ...matching.map((entry) => `- ${entry.summary}`), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function checkRepository(root) {
  const state = await readState(root);
  for (const release of state.releases) {
    const occurrences = countOccurrences(state.changelog, release.content.trim());
    if (occurrences !== 1) throw new ChangelogError(`changelog-release-history-mismatch:${release.version}`);
  }
  return Object.freeze({
    status: "ok",
    packageVersion: state.packageVersion,
    unreleasedEntries: state.entries.length,
    historicalReleases: state.releases.length,
  });
}

export async function previewRepository(root, options = {}) {
  const state = await readState(root);
  if (!options.version) return renderUnreleased(state.entries);
  return renderSection(options.version, options.date ?? isoDate(), state.entries);
}

export async function prepareRepository(root, version, options = {}) {
  const state = await readState(root);
  const date = options.date ?? isoDate();
  if (!versionPattern.test(version)) throw new ChangelogError("changelog-version-invalid");
  if (version !== state.packageVersion) throw new ChangelogError("changelog-package-version-mismatch");
  if (state.releases.some((release) => release.version === version) || state.changelog.includes(`## [${version}]`)) throw new ChangelogError("changelog-version-exists");
  const section = renderSection(version, date, state.entries);
  const anchor = "## [Unreleased]\n";
  if (!state.changelog.includes(anchor)) throw new ChangelogError("changelog-unreleased-anchor-missing");

  const changelogPath = path.join(root, "CHANGELOG.md");
  const releaseDirectory = path.join(root, "changelog", "releases");
  const releasePath = path.join(releaseDirectory, `${version}.md`);
  const archiveDirectory = path.join(root, "changelog", "archive", version);
  const nextChangelog = state.changelog.replace(anchor, `${anchor}\n${section}`);
  const moved = [];
  let releaseWritten = false;
  let changelogWritten = false;
  try {
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(releasePath, section, { encoding: "utf8", flag: "wx" });
    releaseWritten = true;
    await writeFile(changelogPath, nextChangelog, "utf8");
    changelogWritten = true;
    await mkdir(path.dirname(archiveDirectory), { recursive: true });
    await mkdir(archiveDirectory, { recursive: false });
    for (const entry of state.entries) {
      const source = path.join(root, "changelog", "unreleased", entry.filename);
      const destination = path.join(archiveDirectory, entry.filename);
      await rename(source, destination);
      moved.push({ source, destination });
    }
    return Object.freeze({ status: "prepared", version, releaseNotes: path.relative(root, releasePath), entries: state.entries.length });
  } catch (error) {
    for (const item of moved.reverse()) await rename(item.destination, item.source).catch(() => undefined);
    await rm(archiveDirectory, { recursive: true, force: true }).catch(() => undefined);
    if (changelogWritten) await writeFile(changelogPath, state.changelog, "utf8").catch(() => undefined);
    if (releaseWritten) await rm(releasePath, { force: true }).catch(() => undefined);
    if (error instanceof ChangelogError) throw error;
    throw new ChangelogError("changelog-prepare-failed");
  }
}

async function readState(root) {
  const [rootPackage, desktopPackage, changelog] = await Promise.all([
    readJson(path.join(root, "package.json")),
    readJson(path.join(root, "apps", "desktop", "package.json")),
    readFile(path.join(root, "CHANGELOG.md"), "utf8"),
  ]);
  if (rootPackage.version !== desktopPackage.version || typeof rootPackage.version !== "string") throw new ChangelogError("changelog-package-version-mismatch");
  const entries = await readEntries(path.join(root, "changelog", "unreleased"));
  const releases = await readReleases(path.join(root, "changelog", "releases"));
  return { packageVersion: rootPackage.version, changelog, entries, releases };
}

async function readEntries(directory) {
  const names = await readdir(directory);
  const entries = [];
  for (const name of names.sort()) {
    if (name.startsWith(".")) continue;
    if (!name.endsWith(".md")) throw new ChangelogError(`changelog-entry-filename-invalid:${safeFilename(name)}`);
    entries.push(parseEntry(await readFile(path.join(directory, name), "utf8"), name));
  }
  return entries;
}

async function readReleases(directory) {
  const names = await readdir(directory);
  const releases = [];
  for (const name of names.sort()) {
    if (name.startsWith(".")) continue;
    const match = /^(.+)\.md$/u.exec(name);
    if (!match || !versionPattern.test(match[1])) throw new ChangelogError(`changelog-release-filename-invalid:${safeFilename(name)}`);
    const content = (await readFile(path.join(directory, name), "utf8")).replace(/\r\n/gu, "\n");
    if (!content.startsWith(`## [${match[1]}] - `)) throw new ChangelogError(`changelog-release-format-invalid:${match[1]}`);
    releases.push({ version: match[1], content });
  }
  return releases;
}

async function readJson(filename) {
  try { return JSON.parse(await readFile(filename, "utf8")); }
  catch { throw new ChangelogError("changelog-package-invalid"); }
}

function compareEntries(left, right) {
  return left.summary.localeCompare(right.summary, "zh-CN") || left.filename.localeCompare(right.filename, "en");
}

function countOccurrences(source, value) {
  if (!value) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(value, offset)) >= 0) { count += 1; offset += value.length; }
  return count;
}

function safeFilename(value) {
  const base = path.basename(String(value));
  return /^[A-Za-z0-9._-]{1,120}$/u.test(base) ? base : "invalid";
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const [command = "check", argument, ...flags] = process.argv.slice(2);
  const date = flags.find((flag) => flag.startsWith("--date="))?.slice("--date=".length);
  if (command === "check") console.log(JSON.stringify(await checkRepository(root)));
  else if (command === "preview") process.stdout.write(await previewRepository(root, { ...(argument ? { version: argument } : {}), ...(date ? { date } : {}) }));
  else if (command === "prepare" && argument) console.log(JSON.stringify(await prepareRepository(root, argument, { ...(date ? { date } : {}) })));
  else throw new ChangelogError("changelog-command-invalid");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof ChangelogError ? error.message : "changelog-command-failed");
    process.exitCode = 1;
  });
}
