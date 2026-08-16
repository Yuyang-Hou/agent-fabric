import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromDesktop = createRequire(path.join(root, "apps", "desktop", "package.json"));
const { app, BrowserWindow, nativeImage } = requireFromDesktop("electron");
const resources = path.join(root, "apps", "desktop", "build-resources");
const source = path.join(resources, "agent-fabric-mark.svg");
const sourcePng = path.join(resources, "agent-fabric-mark-1024.png");
const iconset = path.join(resources, "AgentFabric.iconset");
const output = path.join(resources, "icon.icns");

app.commandLine.appendSwitch("force-device-scale-factor", "1");

async function generate() {
  await app.whenReady();
  const window = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    webPreferences: { backgroundThrottling: false },
  });
  await window.loadURL(pathToFileURL(source).href);
  const capture = await window.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const fullSize = nativeImage.createFromBuffer(capture.toPNG()).resize({ width: 1024, height: 1024, quality: "best" });
  await writeFile(sourcePng, fullSize.toPNG());

  await rm(iconset, { recursive: true, force: true });
  await mkdir(iconset, { recursive: true });
  const entries = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ];
  await Promise.all(entries.map(async ([name, size]) => {
    const image = fullSize.resize({ width: size, height: size, quality: "best" });
    await writeFile(path.join(iconset, name), image.toPNG());
  }));
  await execFileAsync("/usr/bin/iconutil", ["--convert", "icns", iconset, "--output", output]);
  await rm(iconset, { recursive: true, force: true });
  console.log(JSON.stringify({ status: "ok", source: "agent-fabric-mark.svg", pixels: 1024, output: "icon.icns" }));
  window.destroy();
  app.exit(0);
}

generate().catch((error) => {
  console.error(`macos-icon-generation-failed:${error instanceof Error ? error.message : "unknown"}`);
  app.exit(1);
});
