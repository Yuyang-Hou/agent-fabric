import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

import defaultProduct from "../../config/default-product.json" with { type: "json" };

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const packagedServerBaseUrl = process.env.AGENT_FABRIC_SERVER?.trim() || defaultProduct.desktopServerBaseUrl?.trim() || "";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: { __AGENT_FABRIC_PACKAGED_SERVER__: JSON.stringify(packagedServerBaseUrl) },
    build: {
      outDir: "build",
      emptyOutDir: true,
      rollupOptions: { input: resolve(currentDirectory, "src/main.ts"), output: { entryFileNames: "main.mjs", format: "es" } },
    },
  },
  preload: {
    build: {
      // The renderer is sandboxed, so the preload must be a standalone bundle.
      // Leaving workspace or npm dependencies external makes the packaged app
      // fail before contextBridge can expose the account product API.
      externalizeDeps: false,
      outDir: "build",
      emptyOutDir: false,
      rollupOptions: { input: resolve(currentDirectory, "src/preload.ts"), output: { entryFileNames: "preload.cjs", format: "cjs" } },
    },
  },
  renderer: {
    plugins: [tailwindcss()],
    root: currentDirectory,
    build: { outDir: "build", emptyOutDir: false, rollupOptions: { input: resolve(currentDirectory, "index.html") } },
  },
});
