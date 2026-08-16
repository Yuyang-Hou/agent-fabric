import { ipcRenderer } from "electron";

import {
  UPDATER_CHANGED_CHANNEL,
  UPDATER_CHECK_CHANNEL,
  UPDATER_INSTALL_CHANNEL,
  UPDATER_PREFERENCES_CHANNEL,
  UPDATER_SET_AUTOMATIC_CHANNEL,
  UPDATER_STATE_CHANNEL,
  updaterAutomaticInputSchema,
  updaterPreferencesSchema,
  updaterStateSchema,
  type ElectronUpdaterApi,
} from "./ipc.js";

export const updaterPreloadApi: ElectronUpdaterApi = {
  async snapshot() { return updaterStateSchema.parse(await ipcRenderer.invoke(UPDATER_STATE_CHANNEL)); },
  async preferences() { return updaterPreferencesSchema.parse(await ipcRenderer.invoke(UPDATER_PREFERENCES_CHANNEL)); },
  async setAutomaticUpdates(enabled) {
    return updaterPreferencesSchema.parse(await ipcRenderer.invoke(UPDATER_SET_AUTOMATIC_CHANNEL, updaterAutomaticInputSchema.parse(enabled)));
  },
  async check() { return updaterStateSchema.parse(await ipcRenderer.invoke(UPDATER_CHECK_CHANNEL)); },
  async install() { return updaterStateSchema.parse(await ipcRenderer.invoke(UPDATER_INSTALL_CHANNEL)); },
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => listener(updaterStateSchema.parse(value));
    ipcRenderer.on(UPDATER_CHANGED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(UPDATER_CHANGED_CHANNEL, handler);
  },
};
