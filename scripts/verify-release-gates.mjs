import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
const target = targetIndex >= 0 ? args[targetIndex + 1] : "development";
if (!target) {
  console.error("release-gates: --target requires a value");
  process.exit(2);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(rootDir, "config", "release-gates.json"), "utf8"));
const blocked = config.gates.filter((gate) => gate.requiredFor.includes(target) && gate.status !== "approved");

if (blocked.length > 0) {
  console.error(
    blocked
      .map((gate) => `release-gates: ${target} blocked by ${gate.id}; evidence: ${gate.evidence}`)
      .join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(`release-gates: ${target} ok`);
}
