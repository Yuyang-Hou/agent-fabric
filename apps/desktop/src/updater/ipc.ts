import { z } from "zod";

export const UPDATER_STATE_CHANNEL = "agent-fabric:updater:state";
export const UPDATER_CHANGED_CHANNEL = "agent-fabric:updater:changed";
export const UPDATER_PREFERENCES_CHANNEL = "agent-fabric:updater:preferences";
export const UPDATER_SET_AUTOMATIC_CHANNEL = "agent-fabric:updater:set-automatic";
export const UPDATER_CHECK_CHANNEL = "agent-fabric:updater:check";
export const UPDATER_INSTALL_CHANNEL = "agent-fabric:updater:install";

export const updaterVersionSchema = z.string().trim().min(1).max(80).regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
const currentVersion = updaterVersionSchema;
const targetVersion = updaterVersionSchema;

export const updaterErrorCodeSchema = z.enum([
  "updater-unavailable",
  "update-not-ready",
  "update-network-failed",
  "update-metadata-invalid",
  "update-download-failed",
  "update-install-preparation-failed",
  "update-unknown-failed",
]);

export const updaterStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("idle"), currentVersion }),
  z.strictObject({ status: z.literal("checking"), currentVersion }),
  z.strictObject({ status: z.literal("up-to-date"), currentVersion, checkedAt: z.string().max(64) }),
  z.strictObject({ status: z.literal("downloading"), currentVersion, targetVersion, percent: z.number().min(0).max(100) }),
  z.strictObject({ status: z.literal("ready"), currentVersion, targetVersion, releaseNotes: z.string().max(2_000).optional() }),
  z.strictObject({ status: z.literal("installing"), currentVersion, targetVersion }),
  z.strictObject({ status: z.literal("error"), currentVersion, code: updaterErrorCodeSchema, retryable: z.boolean() }),
]);

export const updaterPreferencesSchema = z.strictObject({ automaticUpdates: z.boolean() });
export const updaterAutomaticInputSchema = z.boolean();

export type UpdaterState = z.infer<typeof updaterStateSchema>;
export type UpdaterPreferences = z.infer<typeof updaterPreferencesSchema>;
export type UpdaterErrorCode = z.infer<typeof updaterErrorCodeSchema>;

export interface ElectronUpdaterApi {
  snapshot(): Promise<UpdaterState>;
  preferences(): Promise<UpdaterPreferences>;
  setAutomaticUpdates(enabled: boolean): Promise<UpdaterPreferences>;
  check(): Promise<UpdaterState>;
  install(): Promise<UpdaterState>;
  subscribe(listener: (state: UpdaterState) => void): () => void;
}

declare global {
  interface Window {
    agentFabricUpdater: ElectronUpdaterApi;
  }
}
