import { accessSync, constants } from "node:fs";
import path from "node:path";

export interface CodexExecutableResolutionOptions {
  readonly explicitPath?: string | undefined;
  readonly pathValue?: string | undefined;
  readonly homeDirectory?: string | undefined;
  readonly platform?: NodeJS.Platform;
  readonly isExecutable?: (candidate: string) => boolean;
}

export function resolveCodexExecutablePath(options: CodexExecutableResolutionOptions = {}): string | undefined {
  const platform = options.platform ?? process.platform;
  const executableName = platform === "win32" ? "codex.exe" : "codex";
  const isExecutable = options.isExecutable ?? canExecute;
  const candidates: string[] = [];
  const explicitPath = options.explicitPath?.trim();
  if (explicitPath) candidates.push(explicitPath);
  for (const directory of (options.pathValue ?? "").split(path.delimiter)) {
    const normalized = directory.trim();
    if (normalized && path.isAbsolute(normalized)) candidates.push(path.join(normalized, executableName));
  }
  if (platform === "darwin") {
    candidates.push("/Applications/ChatGPT.app/Contents/Resources/codex");
    if (options.homeDirectory) candidates.push(path.join(options.homeDirectory, "Applications", "ChatGPT.app", "Contents", "Resources", "codex"));
  }
  return candidates.find((candidate) => path.isAbsolute(candidate) && isExecutable(candidate));
}

function canExecute(candidate: string): boolean {
  try { accessSync(candidate, constants.X_OK); return true; }
  catch { return false; }
}
