import {
  UPDATER_CHANGED_CHANNEL,
  UPDATER_CHECK_CHANNEL,
  UPDATER_INSTALL_CHANNEL,
  UPDATER_PREFERENCES_CHANNEL,
  UPDATER_SET_AUTOMATIC_CHANNEL,
  UPDATER_STATE_CHANNEL,
  updaterAutomaticInputSchema,
  updaterStateSchema,
  updaterVersionSchema,
  type UpdaterErrorCode,
  type UpdaterPreferences,
  type UpdaterState,
} from "./ipc.js";
import { DEFAULT_UPDATER_PREFERENCES, loadUpdaterPreferences, saveUpdaterPreferences } from "./preferences.js";

export const UPDATER_STARTUP_DELAY_MS = 5_000;
export const UPDATER_INTERVAL_MS = 60 * 60 * 1_000;

export interface DriverUpdateInfo {
  readonly version: string;
  readonly releaseNotes?: unknown;
}

export interface DesktopUpdaterDriver {
  configureBetaChannel(): void;
  checkForUpdates(): Promise<{ readonly available: boolean; readonly info: DriverUpdateInfo; readonly download?: Promise<unknown> } | null>;
  install(): void;
  onChecking(listener: () => void): void;
  onAvailable(listener: (info: DriverUpdateInfo) => void): void;
  onNotAvailable(listener: (info: DriverUpdateInfo) => void): void;
  onProgress(listener: (percent: number) => void): void;
  onDownloaded(listener: (info: DriverUpdateInfo) => void): void;
  onError(listener: (error: unknown) => void): void;
}

export interface UpdaterWindow {
  readonly visible: boolean;
  readonly focused: boolean;
  send(channel: string, payload: unknown): void;
  showAndFocus(): void;
}

export interface UpdaterIpc {
  handle(channel: string, handler: (senderId: number, input: unknown) => unknown): void;
}

export interface InstallPlan {
  readonly finish: () => void;
  readonly onFailure: () => void;
}

export interface DesktopUpdaterOptions {
  readonly packaged: boolean;
  readonly currentVersion: string;
  readonly preferencesPath: string;
  readonly driver: DesktopUpdaterDriver;
  readonly ipc: UpdaterIpc;
  readonly isTrustedRenderer: (senderId: number) => boolean;
  readonly getWindow: () => UpdaterWindow | undefined;
  readonly showSystemNotification: (version: string, onClick: () => void) => void;
  readonly requestInstall: (plan: InstallPlan) => void;
  readonly now?: () => Date;
}

export interface DesktopUpdaterController {
  readonly ready: Promise<void>;
  readonly automaticUpdates: boolean;
  snapshot(): UpdaterState;
  checkNow(): Promise<UpdaterState>;
  setAutomaticUpdates(enabled: boolean): Promise<UpdaterPreferences>;
  prepareInstallOnFullQuit(): InstallPlan | undefined;
  dispose(): void;
}

export function createDesktopUpdater(options: DesktopUpdaterOptions): DesktopUpdaterController {
  const currentVersion = updaterVersionSchema.parse(options.currentVersion);
  let state: UpdaterState = { status: "idle", currentVersion };
  let preferences: UpdaterPreferences = { ...DEFAULT_UPDATER_PREFERENCES };
  let inFlightCheck: Promise<UpdaterState> | undefined;
  let startupElapsed = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let periodicTimer: ReturnType<typeof setInterval> | undefined;

  const publish = (next: UpdaterState): UpdaterState => {
    state = updaterStateSchema.parse(next);
    const window = options.getWindow();
    if (window) {
      try { window.send(UPDATER_CHANGED_CHANNEL, state); } catch { /* The window can close between lookup and send. */ }
    }
    return state;
  };

  const fail = (code: UpdaterErrorCode): UpdaterState => publish({ status: "error", currentVersion, code, retryable: true });

  const cancelTimers = (): void => {
    if (startupTimer) clearTimeout(startupTimer);
    if (periodicTimer) clearInterval(periodicTimer);
    startupTimer = undefined;
    periodicTimer = undefined;
  };

  const runAutomaticCheck = (): void => {
    if (!preferences.automaticUpdates || state.status === "ready" || state.status === "installing" || state.status === "downloading") return;
    void checkForUpdates().catch(() => undefined);
  };

  const scheduleTimers = (): void => {
    if (!options.packaged || !preferences.automaticUpdates) return;
    if (!startupElapsed && !startupTimer) {
      startupTimer = setTimeout(() => {
        startupTimer = undefined;
        startupElapsed = true;
        runAutomaticCheck();
      }, UPDATER_STARTUP_DELAY_MS);
    }
    if (!periodicTimer) periodicTimer = setInterval(runAutomaticCheck, UPDATER_INTERVAL_MS);
  };

  const setDownloading = (info: DriverUpdateInfo, percent = 0): UpdaterState => {
    const parsed = updaterVersionSchema.safeParse(info.version);
    if (!parsed.success) return fail("update-metadata-invalid");
    return publish({ status: "downloading", currentVersion, targetVersion: parsed.data, percent: clampPercent(percent) });
  };

  const updateIsTerminal = (): boolean => state.status === "ready" || state.status === "installing";

  const checkForUpdates = async (): Promise<UpdaterState> => {
    if (!options.packaged) return fail("updater-unavailable");
    if (state.status === "ready" || state.status === "installing" || state.status === "downloading") return state;
    if (inFlightCheck) return inFlightCheck;

    const operation = (async () => {
      publish({ status: "checking", currentVersion });
      try {
        const result = await options.driver.checkForUpdates();
        if (!result) return fail("updater-unavailable");
        if (!updaterVersionSchema.safeParse(result.info.version).success) return fail("update-metadata-invalid");
        if (!result.available) return publish({ status: "up-to-date", currentVersion, checkedAt: (options.now ?? (() => new Date()))().toISOString() });
        if (!updateIsTerminal()) setDownloading(result.info);
        void result.download?.catch(() => {
          if (!updateIsTerminal()) fail("update-download-failed");
        });
        return state;
      } catch (error) {
        return fail(mapUpdaterError(error, "check"));
      }
    })().finally(() => {
      if (inFlightCheck === operation) inFlightCheck = undefined;
    });
    inFlightCheck = operation;
    return operation;
  };

  const createInstallPlan = (): InstallPlan | undefined => {
    if (state.status !== "ready") return undefined;
    const targetVersion = state.targetVersion;
    publish({ status: "installing", currentVersion, targetVersion });
    const onFailure = (): void => { fail("update-install-preparation-failed"); };
    return {
      finish() {
        try { options.driver.install(); } catch { onFailure(); }
      },
      onFailure,
    };
  };

  const installNow = (): UpdaterState => {
    const plan = createInstallPlan();
    if (!plan) return fail("update-not-ready");
    try { options.requestInstall(plan); } catch { plan.onFailure(); }
    return state;
  };

  const assertTrusted = (senderId: number): void => {
    if (!options.isTrustedRenderer(senderId)) throw new Error("untrusted-renderer");
  };

  options.ipc.handle(UPDATER_STATE_CHANNEL, async (senderId) => {
    assertTrusted(senderId);
    await ready;
    return updaterStateSchema.parse(state);
  });
  options.ipc.handle(UPDATER_PREFERENCES_CHANNEL, async (senderId) => {
    assertTrusted(senderId);
    await ready;
    return { ...preferences };
  });
  options.ipc.handle(UPDATER_SET_AUTOMATIC_CHANNEL, async (senderId, input) => {
    assertTrusted(senderId);
    await ready;
    return setAutomaticUpdates(updaterAutomaticInputSchema.parse(input));
  });
  options.ipc.handle(UPDATER_CHECK_CHANNEL, async (senderId) => {
    assertTrusted(senderId);
    await ready;
    return checkForUpdates();
  });
  options.ipc.handle(UPDATER_INSTALL_CHANNEL, async (senderId) => {
    assertTrusted(senderId);
    await ready;
    return updaterStateSchema.parse(installNow());
  });

  if (options.packaged) {
    options.driver.configureBetaChannel();
    options.driver.onChecking(() => { if (state.status !== "ready" && state.status !== "installing") publish({ status: "checking", currentVersion }); });
    options.driver.onAvailable((info) => { if (state.status !== "ready" && state.status !== "installing") setDownloading(info); });
    options.driver.onNotAvailable(() => { if (state.status !== "ready" && state.status !== "installing") publish({ status: "up-to-date", currentVersion, checkedAt: (options.now ?? (() => new Date()))().toISOString() }); });
    options.driver.onProgress((percent) => {
      if (state.status === "downloading") publish({ ...state, percent: clampPercent(percent) });
    });
    options.driver.onDownloaded((info) => {
      const parsed = updaterVersionSchema.safeParse(info.version);
      if (!parsed.success) { fail("update-metadata-invalid"); return; }
      const releaseNotes = sanitizeReleaseNotes(info.releaseNotes);
      publish({ status: "ready", currentVersion, targetVersion: parsed.data, ...(releaseNotes ? { releaseNotes } : {}) });
      const window = options.getWindow();
      if (!window || !window.visible || !window.focused) {
        options.showSystemNotification(parsed.data, () => options.getWindow()?.showAndFocus());
      }
    });
    options.driver.onError((error) => {
      if (state.status !== "ready" && state.status !== "installing") fail(mapUpdaterError(error, state.status === "downloading" ? "download" : "check"));
    });
  }

  const ready = loadUpdaterPreferences(options.preferencesPath).then((loaded) => {
    preferences = loaded;
    scheduleTimers();
  });

  async function setAutomaticUpdates(enabled: boolean): Promise<UpdaterPreferences> {
    const next = { automaticUpdates: enabled };
    await saveUpdaterPreferences(options.preferencesPath, next);
    const wasEnabled = preferences.automaticUpdates;
    preferences = next;
    if (!enabled) cancelTimers();
    else {
      if (!wasEnabled && startupElapsed) runAutomaticCheck();
      scheduleTimers();
    }
    return { ...preferences };
  }

  return {
    ready,
    get automaticUpdates() { return preferences.automaticUpdates; },
    snapshot: () => updaterStateSchema.parse(state),
    checkNow: async () => { await ready; return checkForUpdates(); },
    setAutomaticUpdates: async (enabled) => { await ready; return setAutomaticUpdates(updaterAutomaticInputSchema.parse(enabled)); },
    prepareInstallOnFullQuit: createInstallPlan,
    dispose: cancelTimers,
  };
}

export function sanitizeReleaseNotes(value: unknown): string | undefined {
  const source = typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.map((item) => typeof item === "object" && item !== null && "note" in item ? String((item as { note?: unknown }).note ?? "") : "").join("\n")
      : "";
  const sanitized = source
    .replace(/<[^>]*>/gu, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 2_000);
  return sanitized || undefined;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function mapUpdaterError(error: unknown, phase: "check" | "download"): UpdaterErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOTFOUND|ECONN|ETIMEDOUT|network|HTTP\s*[45]\d\d/iu.test(message)) return "update-network-failed";
  if (/sha|checksum|signature|metadata|ya?ml|version|architecture/iu.test(message)) return "update-metadata-invalid";
  return phase === "download" ? "update-download-failed" : "update-unknown-failed";
}
