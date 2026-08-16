import { contextBridge, ipcRenderer } from "electron";

import {
  ACCOUNT_PRODUCT_CHANGED_CHANNEL,
  ACCOUNT_PRODUCT_COMMAND_CHANNEL,
  ACCOUNT_PRODUCT_SNAPSHOT_CHANNEL,
  accountProductRendererCommandResultSchema,
  accountProductRendererCommandSchema,
  accountProductRendererSnapshotSchema,
  type ElectronAccountProductApi,
} from "./account-product/ipc.js";
import { updaterPreloadApi } from "./updater/preload.js";

const accountApi: ElectronAccountProductApi = {
  async snapshot() { return accountProductRendererSnapshotSchema.parse(await ipcRenderer.invoke(ACCOUNT_PRODUCT_SNAPSHOT_CHANNEL)); },
  async command(command) {
    return accountProductRendererCommandResultSchema.parse(await ipcRenderer.invoke(ACCOUNT_PRODUCT_COMMAND_CHANNEL, accountProductRendererCommandSchema.parse(command)));
  },
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => listener(accountProductRendererSnapshotSchema.parse(value));
    ipcRenderer.on(ACCOUNT_PRODUCT_CHANGED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(ACCOUNT_PRODUCT_CHANGED_CHANNEL, handler);
  },
};

contextBridge.exposeInMainWorld("agentFabricAccount", accountApi);
contextBridge.exposeInMainWorld("agentFabricUpdater", updaterPreloadApi);
