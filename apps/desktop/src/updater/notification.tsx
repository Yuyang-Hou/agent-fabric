import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

import type { ElectronUpdaterApi, UpdaterState } from "./ipc.js";
import "./notification.css";

export function useAgentFabricUpdater(api: ElectronUpdaterApi = window.agentFabricUpdater): UpdaterState | undefined {
  const [state, setState] = useState<UpdaterState>();

  useEffect(() => {
    let mounted = true;
    const unsubscribe = api.subscribe((next) => { if (mounted) setState(next); });
    void api.snapshot().then((next) => { if (mounted) setState(next); }).catch(() => undefined);
    return () => { mounted = false; unsubscribe(); };
  }, [api]);

  return state;
}

export function AgentFabricUpdateNotification({ api = window.agentFabricUpdater }: { readonly api?: ElectronUpdaterApi }) {
  const state = useAgentFabricUpdater(api);
  const [dismissedVersion, setDismissedVersion] = useState<string>();

  useEffect(() => {
    if (state?.status === "ready" && state.targetVersion !== dismissedVersion) setDismissedVersion(undefined);
  }, [dismissedVersion, state]);

  if (!state || (state.status !== "ready" && state.status !== "installing")) return null;
  if (state.status === "ready" && dismissedVersion === state.targetVersion) return null;

  const installing = state.status === "installing";
  return (
    <aside className="agent-fabric-update-notification" aria-live="polite" aria-label="Agent Fabric 更新">
      {!installing && (
        <button className="agent-fabric-update-dismiss" type="button" aria-label="稍后提醒" onClick={() => setDismissedVersion(state.targetVersion)}>
          <X aria-hidden="true" />
        </button>
      )}
      <span className="agent-fabric-update-icon"><RefreshCw aria-hidden="true" /></span>
      <div className="agent-fabric-update-copy">
        <strong>{installing ? "正在准备更新" : "更新已就绪"}</strong>
        <p>Agent Fabric {state.targetVersion}{installing ? " 正在安全停止本地服务。" : " 已下载完成。"}</p>
        {!installing && state.releaseNotes && <small>{state.releaseNotes}</small>}
        {!installing && (
          <div className="agent-fabric-update-actions">
            <button type="button" onClick={() => setDismissedVersion(state.targetVersion)}>稍后</button>
            <button type="button" className="is-primary" onClick={() => void api.install().catch(() => undefined)}>重新启动并更新</button>
          </div>
        )}
      </div>
    </aside>
  );
}
