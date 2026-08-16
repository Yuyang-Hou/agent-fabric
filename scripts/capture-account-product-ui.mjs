import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electron = path.join(root, "apps", "desktop", "node_modules", ".bin", "electron");
const capture = path.join(root, "scripts", "capture-desktop.mjs");
const output = path.join(root, "docs", "implementation", "replace-account-members-with-friends", "ui-captures");
const only = process.argv[2];
await fs.mkdir(output, { recursive: true });

const cases = [
  ["login-1280x800.png", "login", 1280, 800],
  ["agents-1280x800.png", "agents", 1280, 800],
  ["agents-1440x900.png", "agents", 1440, 900],
  ["agents-1728x1117.png", "agents", 1728, 1117],
  ["agents-768x900.png", "agents", 768, 900],
  ["agents-414x896.png", "agents", 414, 896],
  ["agents-friends-1280x800.png", "agents-friends", 1280, 800],
  ["agents-friends-768x900.png", "agents-friends", 768, 900],
  ["agents-friends-414x896.png", "agents-friends", 414, 896],
  ["agents-filter-1280x800.png", "agents", 1280, 800, "filter"],
  ["agents-batch-1280x800.png", "agents", 1280, 800, "batch"],
  ["agents-loading-1280x800.png", "agents-loading", 1280, 800],
  ["agents-empty-1280x800.png", "agents-empty", 1280, 800],
  ["agents-error-1280x800.png", "agents-error", 1280, 800],
  ["create-choice-1280x800.png", "create", 1280, 800],
  ["create-choice-768x900.png", "create", 768, 900],
  ["create-choice-414x896.png", "create", 414, 896],
  ["create-manual-1280x800.png", "manual", 1280, 800],
  ["create-builder-1280x800.png", "builder", 1280, 800],
  ["agent-detail-1280x800.png", "detail", 1280, 800],
  ["agent-detail-768x900.png", "detail", 768, 900],
  ["agent-detail-414x896.png", "detail", 414, 896],
  ["agent-capabilities-1280x800.png", "detail-capabilities", 1280, 800],
  ["agent-settings-1280x800.png", "detail-settings", 1280, 800],
  ["agent-dirty-guard-1280x800.png", "detail-settings", 1280, 800, "dirty-guard"],
  ["runtimes-1280x800.png", "runtimes", 1280, 800],
  ["runtimes-768x900.png", "runtimes", 768, 900],
  ["runtimes-414x896.png", "runtimes", 414, 896],
  ["runtime-detail-1280x800.png", "runtime-detail", 1280, 800],
  ["runtime-detail-768x900.png", "runtime-detail", 768, 900],
  ["runtime-detail-414x896.png", "runtime-detail", 414, 896],
  ["runtime-auth-required-1280x800.png", "runtime-auth", 1280, 800],
  ["runtime-delete-impact-1280x800.png", "runtime-impact", 1280, 800],
  ["friends-1280x800.png", "friends", 1280, 800],
  ["friends-1728x1117.png", "friends", 1728, 1117],
  ["friends-768x900.png", "friends", 768, 900],
  ["friends-414x896.png", "friends", 414, 896],
];

const selectedCases = only ? cases.filter(([name]) => name.startsWith(only)) : cases;
if (selectedCases.length === 0) throw new Error(`capture-case-not-found:${only}`);

for (const [name, state, width, height, interaction] of selectedCases) {
  await run(electron, [capture, path.join(output, name)], {
    AGENT_FABRIC_MODE: "account-ui-acceptance",
    AGENT_FABRIC_CAPTURE_STATE: state,
    AGENT_FABRIC_CAPTURE_WIDTH: String(width),
    AGENT_FABRIC_CAPTURE_HEIGHT: String(height),
    ...(interaction ? { AGENT_FABRIC_CAPTURE_INTERACTION: interaction } : {}),
  });
}

console.log(`account-product-ui-captures: ${selectedCases.length}`);

function run(command, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...environment }, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`capture-exit-${code ?? "unknown"}`)));
  });
}
