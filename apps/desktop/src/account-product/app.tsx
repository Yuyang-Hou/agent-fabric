import type { AgentCatalogQuery, AgentDraft } from "@agent-fabric/account-agent-domain";
import { rowSelectionFeature, tableFeatures, useTable, type RowSelectionState } from "@tanstack/react-table";
import {
  Activity, Archive, ArrowLeft, Boxes, Check, ChevronDown, ChevronRight, CircleAlert, Clock3,
  Filter, KeyRound, LayoutList, LogIn, LogOut, Monitor, MoreHorizontal, Plus, RefreshCw,
  RotateCcw, Search, Shield, Sparkles, TerminalSquare, Trash2, UserPlus, Users, WandSparkles, WifiOff, X, type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Toaster, toast } from "sonner";

import type { AccountProductRendererCommand, AccountProductRendererSnapshot, ElectronAccountProductApi } from "./ipc.js";
import { AgentFabricMark } from "./agent-fabric-mark.js";
import { FabricButton, FabricCheckbox, FabricDialog, FabricMenu, FabricPopover, FabricSelect, FabricStatus, FabricTabs, LoadingRows, SettingRow, SurfaceState } from "./ui.js";

const collectionTableFeatures = tableFeatures({ rowSelectionFeature });

export interface AccountProductBridge {
  getSnapshot(): AccountProductRendererSnapshot;
  subscribe(listener: () => void): () => void;
  command(command: AccountProductRendererCommand): Promise<void>;
}

export function createAccountProductBridge(api: ElectronAccountProductApi): AccountProductBridge {
  let snapshot = initialSnapshot();
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  api.subscribe((next) => { snapshot = next; emit(); });
  void api.snapshot().then((next) => { snapshot = next; emit(); }).catch(() => { snapshot = { ...snapshot, loading: false, errorCode: "account-product-bootstrap-failed" }; emit(); });
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async command(command) {
      const result = await api.command(command);
      snapshot = result.snapshot;
      emit();
    },
  };
}

export function AccountProductApp({ bridge }: { readonly bridge: AccountProductBridge }) {
  const snapshot = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [busy, setBusy] = useState<AccountProductRendererCommand["type"]>();
  const run = async (command: AccountProductRendererCommand) => {
    setBusy(command.type);
    try { await bridge.command(command); return true; }
    catch (error) { toast.error(errorMessage(error), { id: "account-operation" }); return false; }
    finally { setBusy(undefined); }
  };

  if (snapshot.loading && snapshot.session.state !== "signing-in") return <><BootstrapScreen /><Toaster position="top-right" /></>;
  if (snapshot.session.state !== "signed-in") return <><LoginScreen snapshot={snapshot} busy={busy === "login-start" || snapshot.session.state === "signing-in"} onLogin={() => void run({ type: "login-start" })} /><Toaster position="top-right" /></>;

  const nav = (name: "agents" | "runtimes" | "friends") => void run({ type: "navigate", route: { name } });
  const root = routeRoot(snapshot.route.name);
  return <div className="product-frame">
    <div className="window-drag-region" data-window-drag-region aria-hidden="true" />
    <aside className="primary-rail">
      <div className="window-clearance" aria-hidden="true" />
      <FabricMenu triggerClassName="account-switch" triggerAriaLabel="Account 菜单" align="start" header={<><strong>{snapshot.session.displayName}</strong><small>{snapshot.session.email}</small></>} items={[{ id: "logout", label: "退出登录", icon: <LogOut aria-hidden="true" />, onSelect: () => void run({ type: "logout" }) }]} trigger={<>
        <span className="identity-disc">{snapshot.session.accountName.slice(0, 1).toUpperCase()}</span>
        <span><strong>{snapshot.session.accountName}</strong><small>个人 Account</small></span>
        <ChevronDown aria-hidden="true" />
      </>} />
      <nav aria-label="主导航">
        <NavItem icon={AgentFabricMark} label="智能体" active={root === "agents"} onClick={() => nav("agents")} />
        <NavItem icon={Monitor} label="运行时" active={root === "runtimes"} onClick={() => nav("runtimes")} />
        <NavItem icon={Users} label="好友" active={root === "friends"} onClick={() => nav("friends")} />
      </nav>
      <div className="rail-spacer" />
      <div className="service-state" aria-label="本地服务状态">
        <ServiceLine label="Runtime" value={snapshot.localServices.runtime.state} />
        <ServiceLine label="Codex MCP" value={snapshot.localServices.mcp.state} />
        <ServiceLine label="Cloud" value={snapshot.connection} />
      </div>
    </aside>
    <main className="product-canvas" aria-busy={snapshot.refreshing || undefined}>
      {snapshot.legacyRecovery.state !== "not_required" && <MigrationNotice snapshot={snapshot} run={run} />}
      <RouteSurface snapshot={snapshot} busy={busy} run={run} />
    </main>
    <Toaster position="top-right" closeButton />
  </div>;
}

function RouteSurface({ snapshot, busy, run }: ViewProps) {
  switch (snapshot.route.name) {
    case "agents": return <AgentsCatalog snapshot={snapshot} busy={busy} run={run} />;
    case "agent-create-choice": return <CreateChoice snapshot={snapshot} busy={busy} run={run} />;
    case "agent-create-manual": return <ManualCreate snapshot={snapshot} busy={busy} run={run} />;
    case "agent-create-ai": return <BuilderCreate snapshot={snapshot} busy={busy} run={run} />;
    case "agent-detail": return <AgentDetail snapshot={snapshot} busy={busy} run={run} />;
    case "runtimes": return <RuntimeCatalog snapshot={snapshot} busy={busy} run={run} />;
    case "runtime-detail": return <RuntimeDetail snapshot={snapshot} busy={busy} run={run} />;
    case "friends": return <FriendsSurface snapshot={snapshot} busy={busy} run={run} />;
  }
}

function AgentsCatalog({ snapshot, busy, run }: ViewProps) {
  const catalog = snapshot.catalog;
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<AgentCatalogQuery["availability"][number] | "all">("all");
  const [sort, setSort] = useState<AgentCatalogQuery["sort"]>("last_active");
  const [access, setAccess] = useState<AgentCatalogQuery["access"][number] | "">("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const rows = catalog?.rows ?? [];
  const table = useTable({ features: collectionTableFeatures, columns: [], data: rows, getRowId: catalogAgentId, state: { rowSelection }, onRowSelectionChange: (updater) => setRowSelection((current) => typeof updater === "function" ? updater(current) : updater) }, (state) => ({ rowSelection: state.rowSelection }));
  const selected = Object.keys(table.state.rowSelection);
  const query = (scope: AgentCatalogQuery["scope"] = catalog?.scope ?? "mine", nextSearch = search): AgentCatalogQuery => ({
    scope, ...(nextSearch.trim() ? { search: nextSearch.trim() } : {}), availability: availability === "all" ? [] : [availability],
    runtimeIds: [], ownerUserIds: [], models: [], access: access ? [access] : [], sort, limit: 100,
  });
  const submit = (event: FormEvent) => { event.preventDefault(); void run({ type: "catalog-query", query: query() }); };
  const updateSort = (value: AgentCatalogQuery["sort"]) => { setSort(value); void run({ type: "catalog-query", query: { ...query(), sort: value } }); };
  const toggleAll = (checked: boolean) => table.toggleAllRowsSelected(checked, { deselectAll: !checked });
  const batch = () => void run({ type: "agent-batch-lifecycle", request: { action: catalog?.scope === "archived" ? "restore" : "archive", items: table.getSelectedRowModel().rows.flatMap(({ original: row }) => "kind" in row ? [] : [{ agentId: row.agent.agentId, expectedVersion: row.agent.version }]) } });

  return <PageSurface collection icon={AgentFabricMark} title="智能体" {...(catalog ? { count: catalog.counts.mine + catalog.counts.friends } : {})} description="管理我的智能体，并查看好友向你开放的智能体。" action={<FabricButton tone="primary" onClick={() => void run({ type: "navigate", route: { name: "agent-create-choice" } })}><Plus aria-hidden="true" />新建智能体</FabricButton>}>
    <div className="resource-toolbar">
      <form className="catalog-search" role="search" onSubmit={submit}><Search aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索智能体…" aria-label="搜索智能体" />{search && <button type="button" aria-label="清除搜索" onClick={() => { setSearch(""); void run({ type: "catalog-query", query: query(catalog?.scope, "") }); }}><X aria-hidden="true" /></button>}</form>
      <div className="scope-switch" aria-label="智能体范围">{(["mine", "friends", "archived"] as const).map((scope) => <button key={scope} aria-pressed={catalog?.scope === scope} onClick={() => { table.resetRowSelection(true); setAccess(scope === "friends" ? "friend" : ""); void run({ type: "catalog-query", query: { ...query(scope), access: scope === "friends" ? ["friend"] : [] } }); }}>{scopeLabel(scope)} <b>{catalog?.counts[scope] ?? 0}</b></button>)}</div>
      <FabricPopover open={filterOpen} onOpenChange={setFilterOpen} triggerClassName={`fabric-button fabric-button-secondary ${filterOpen ? "is-active" : ""}`} triggerAriaLabel="筛选智能体" trigger={<><Filter aria-hidden="true" />筛选{[availability !== "all", access].filter(Boolean).length ? <b>{[availability !== "all", access].filter(Boolean).length}</b> : null}</>} popupClassName="filter-popover">
        <label>状态<FabricSelect ariaLabel="状态" value={availability} onValueChange={setAvailability} options={[{ value: "all", label: "全部状态" }, { value: "online", label: "在线" }, { value: "unstable", label: "不稳定" }, { value: "offline", label: "离线" }, { value: "needs_runtime", label: "未绑定" }]} /></label>
        <label>访问权限<FabricSelect ariaLabel="访问权限" value={access} onValueChange={(value) => setAccess(value as typeof access)} options={[{ value: "", label: "全部权限" }, { value: "owner", label: "我拥有" }, { value: "friend", label: "好友开放" }, { value: "none", label: "不可调用" }]} /></label>
        <div><FabricButton tone="quiet" onClick={() => { setAvailability("all"); setAccess(""); }}>重置</FabricButton><FabricButton tone="primary" onClick={() => { setFilterOpen(false); void run({ type: "catalog-query", query: query() }); }}>应用筛选</FabricButton></div>
      </FabricPopover>
      <label className="toolbar-select"><Clock3 aria-hidden="true" /><span className="sr-only">排序</span><FabricSelect compact ariaLabel="排序" value={sort} onValueChange={updateSort} options={[{ value: "last_active", label: "最近活跃" }, { value: "name", label: "名称" }, { value: "runs", label: "运行次数" }, { value: "created", label: "创建时间" }]} /></label>
    </div>
    {selected.length > 0 && catalog?.scope !== "friends" && <div className="batch-bar" role="status"><strong>已选择 {selected.length} 个智能体</strong><span /><FabricButton tone="quiet" onClick={() => table.resetRowSelection(true)}>取消选择</FabricButton><FabricButton tone="secondary" loading={busy === "agent-batch-lifecycle"} onClick={batch}>{catalog?.scope === "archived" ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}{catalog?.scope === "archived" ? "批量恢复" : "批量归档"}</FabricButton></div>}
    {!catalog && snapshot.errorCode ? <SurfaceState icon={WifiOff} title="无法加载智能体" description="连接恢复后重试，现有智能体不会受到影响。" action={<FabricButton onClick={() => void run({ type: "catalog-query", query: query() })}><RefreshCw aria-hidden="true" />重试</FabricButton>} />
      : !catalog ? <LoadingRows />
      : rows.length === 0 ? <SurfaceState icon={search || availability !== "all" ? Search : AgentFabricMark} title={search || availability !== "all" ? "没有匹配的智能体" : catalog.scope === "archived" ? "没有已归档的智能体" : "创建第一个智能体"} description={search || availability !== "all" ? "调整搜索或筛选条件后再试。" : "从空白、模板或 AI Builder 开始。"} action={search || availability !== "all" ? <FabricButton onClick={() => { setSearch(""); setAvailability("all"); void run({ type: "catalog-query", query: { ...query(), search: undefined, availability: [] } }); }}>清除条件</FabricButton> : <FabricButton tone="primary" onClick={() => void run({ type: "navigate", route: { name: "agent-create-choice" } })}><Plus aria-hidden="true" />新建智能体</FabricButton>} />
      : <div className="resource-roster agent-roster">
        <div className="roster-head">{catalog.scope === "friends" ? <span /> : <FabricCheckbox ariaLabel="选择全部智能体" checked={table.getIsAllRowsSelected()} onCheckedChange={toggleAll} />}<span>智能体</span><span>状态</span><span className="optional-column">Owner</span><span className="optional-column">访问权限</span><span>能力 / Runtime</span><span className="optional-column">最近更新</span><span /></div>
        <div className="collection-rows">{table.getRowModel().rows.map((tableRow) => { const row = tableRow.original; if ("kind" in row) return <div className="roster-row agent-row friend-agent-row" key={tableRow.id}>
          <span /><div className="row-identity"><IdentityMark name={row.name} /><span><strong>{row.name}</strong><small>{row.description || "暂无描述"}</small></span></div>
          <FabricStatus value={row.availability} /><span className="row-owner optional-column"><IdentityMark name={row.owner.displayName} small />{row.owner.displayName}</span><span className="optional-column">好友开放</span><span>{row.capabilitySummary.join(" · ")}</span><span className="optional-column">{formatRelative(row.updatedAt)}</span><span className="status-chip">只读</span>
        </div>; return <div className={`roster-row agent-row ${tableRow.getIsSelected() ? "is-selected" : ""}`} key={tableRow.id}>
          <FabricCheckbox ariaLabel={`选择 ${row.agent.name}`} checked={tableRow.getIsSelected()} onCheckedChange={(checked) => tableRow.toggleSelected(checked)} />
          <button className="row-identity" onClick={() => void run({ type: "agent-open", agentId: row.agent.agentId, section: "overview" })}><IdentityMark name={row.agent.name} /><span><strong>{row.agent.name}</strong><small>{row.agent.description || "暂无描述"}</small></span></button>
          <FabricStatus value={row.status} /><span className="row-owner optional-column"><IdentityMark name={row.owner.displayName} small />{row.owner.displayName}</span><span className="optional-column">我拥有</span><span>{row.runtime?.name ?? "—"}</span><span className="optional-column">{formatRelative(row.lastActiveAt ?? row.agent.updatedAt)}</span>
          <FabricMenu triggerClassName="row-more" triggerAriaLabel={`${row.agent.name} 更多操作`} trigger={<MoreHorizontal aria-hidden="true" />} items={[{ id: "open", label: "打开详情", onSelect: () => void run({ type: "agent-open", agentId: row.agent.agentId, section: "overview" }) }, catalog.scope === "archived" ? { id: "restore", label: "恢复", icon: <RotateCcw aria-hidden="true" />, onSelect: () => void run({ type: "agent-restore", agentId: row.agent.agentId, expectedVersion: row.agent.version }) } : { id: "archive", label: "归档", icon: <Archive aria-hidden="true" />, onSelect: () => void run({ type: "agent-archive", agentId: row.agent.agentId, expectedVersion: row.agent.version }) }]} />
        </div>; })}</div>
        <div className="collection-footer"><span>显示 {rows.length} 个智能体</span><span>{selected.length ? `已选择 ${selected.length} 个` : ""}</span></div>
      </div>}
  </PageSurface>;
}

function CreateChoice({ snapshot, busy, run }: ViewProps) {
  return <PageSurface icon={WandSparkles} title="新建智能体" description="选择起点；三种方式最终都会生成同一份可编辑配置。" back={() => void run({ type: "navigate", route: { name: "agents" } })}>
    <div className="method-intro"><h2>你想从哪里开始？</h2><p>完全自行配置、采用已验证模板，或通过对话让 AI Builder 准备草稿。</p></div>
    <div className="method-grid">
      <MethodCard icon={LayoutList} title="从空白开始" description="逐项配置身份、Instructions、Runtime、模型、能力和访问权限。" onClick={() => void run({ type: "draft-create", mode: "blank" })} busy={busy === "draft-create"} />
      <MethodCard icon={Sparkles} title="使用 AI Builder" description="描述目标，Builder 会提问并持续保存一份可恢复的完整草稿。" recommended onClick={() => void run({ type: "draft-create", mode: "ai" })} busy={busy === "draft-create"} />
    </div>
    {snapshot.drafts.filter((draft) => draft.state !== "created").length > 0 && <section className="template-section draft-resume-section"><div><h2>继续草稿</h2><p>这些草稿已保存在 Account 中，可以从上次编辑的位置继续。</p></div><div className="template-grid">{snapshot.drafts.filter((draft) => draft.state !== "created").map((draft) => <button key={draft.draftId} onClick={() => void run({ type: "draft-open", draftId: draft.draftId })}><Clock3 aria-hidden="true" /><span><strong>{draft.name || "未命名草稿"}</strong><small>{draft.mode === "ai" ? "AI Builder" : draft.mode === "template" ? "模板" : "空白创建"} · {formatRelative(draft.updatedAt)}</small></span><ChevronRight aria-hidden="true" /></button>)}</div></section>}
    {snapshot.templates.length > 0 && <section className="template-section"><div><h2>从模板开始</h2><p>模板会原子导入所需 Skill，不会留下半创建资源。</p></div><div className="template-grid">{snapshot.templates.map((template) => <button key={template.templateId} onClick={() => void run({ type: "draft-create", mode: "template", templateId: template.templateId })}><Boxes aria-hidden="true" /><span><strong>{template.name}</strong><small>{template.description || "已验证的 Agent Fabric 模板"}</small></span><ChevronRight aria-hidden="true" /></button>)}</div></section>}
  </PageSurface>;
}

function ManualCreate({ snapshot, busy, run }: ViewProps) {
  const draft = snapshot.activeDraft;
  if (!draft) return <PageSurface icon={AgentFabricMark} title="创建智能体" description="正在恢复草稿…" back={() => void run({ type: "navigate", route: { name: "agent-create-choice" } })}><LoadingRows count={3} /></PageSurface>;
  return <AgentDraftForm draft={draft} validation={snapshot.draftValidation} runtimes={snapshot.runtimes} busy={busy} run={run} />;
}

function AgentDraftForm({ draft, validation, runtimes, busy, run }: { readonly draft: AgentDraft; readonly validation: AccountProductRendererSnapshot["draftValidation"]; readonly runtimes: AccountProductRendererSnapshot["runtimes"]; readonly busy: ViewProps["busy"]; readonly run: ViewProps["run"] }) {
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [instructions, setInstructions] = useState(draft.configuration.instructions);
  const [runtimeId, setRuntimeId] = useState(draft.runtimeId ?? "");
  const [permissionMode, setPermissionMode] = useState(draft.permissionMode);
  const [model, setModel] = useState(draft.configuration.model ?? "");
  const [thinkingLevel, setThinkingLevel] = useState(draft.configuration.thinkingLevel ?? "medium");
  const [serviceTier, setServiceTier] = useState(draft.configuration.serviceTier ?? "default");
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(draft.configuration.maxConcurrentTasks);
  const selectedRuntime = runtimes.find((runtime) => runtime.runtimeId === runtimeId);
  const selectedModel = selectedRuntime?.capabilities.modelCatalog?.find((item) => item.model === model);
  const dirty = name !== draft.name || description !== draft.description || instructions !== draft.configuration.instructions || runtimeId !== (draft.runtimeId ?? "") || permissionMode !== draft.permissionMode || model !== (draft.configuration.model ?? "") || thinkingLevel !== (draft.configuration.thinkingLevel ?? "medium") || serviceTier !== (draft.configuration.serviceTier ?? "default") || maxConcurrentTasks !== draft.configuration.maxConcurrentTasks;
  const nextConfiguration = { ...draft.configuration, instructions, ...(model ? { model } : { model: undefined }), ...(selectedRuntime?.capabilities.supportsThinkingLevel ? { thinkingLevel: thinkingLevel as AgentDraft["configuration"]["thinkingLevel"] } : { thinkingLevel: undefined }), ...(selectedRuntime?.capabilities.supportsServiceTier ? { serviceTier: serviceTier as AgentDraft["configuration"]["serviceTier"] } : { serviceTier: undefined }), maxConcurrentTasks };
  const save = async () => run({ type: "draft-save", draftId: draft.draftId, update: { name, description, ...(runtimeId ? { runtimeId } : {}), permissionMode, configuration: nextConfiguration, pendingUserText: draft.pendingUserText, expectedVersion: draft.version } });
  const create = async () => { if (dirty && !await save()) return; await run({ type: "draft-create-agent", draftId: draft.draftId, expectedVersion: dirty ? draft.version + 1 : draft.version, idempotencyKey: `desktop:create:${draft.draftId}:${Date.now()}` }); };
  return <PageSurface icon={AgentFabricMark} title="创建智能体" description={draft.mode === "template" ? "检查模板配置并创建。" : "检查身份、行为、Runtime 与访问范围。"} back={() => void (async () => { if (!dirty || await save()) await run({ type: "navigate", route: { name: "agent-create-choice" } }); })()} meta={<><span className="meta-pill">{draft.mode === "template" ? "模板" : "空白创建"}</span><span className={`save-state ${dirty ? "is-dirty" : ""}`}>{dirty ? "有未保存修改" : "已保存"}</span></>} footer={<><FabricButton tone="quiet" loading={busy === "draft-save"} disabled={!dirty} onClick={() => void save()}>保存草稿</FabricButton><FabricButton tone="primary" loading={busy === "draft-create-agent"} disabled={!name.trim()} onClick={() => void create()}>创建并打开智能体</FabricButton></>}>
    <div className="studio-column">
      {validation && !validation.valid && <div className="inline-state is-error"><CircleAlert aria-hidden="true" /><span><strong>还不能创建智能体</strong><small>{validation.fieldErrors.map((error) => draftFieldError(error.field)).join("；")}</small></span></div>}
      <SettingsSection title="身份" description="使用清晰的名称和一句话说明，让好友可以快速判断它的用途。">
        <SettingRow label="头像" description="当前使用自动生成的首字母标识。"><IdentityMark name={name || "Agent"} /></SettingRow>
        <SettingRow label="名称"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} aria-label="智能体名称" /></SettingRow>
        <SettingRow label="描述"><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} aria-label="智能体描述" /></SettingRow>
      </SettingsSection>
      <SettingsSection title="行为与能力" description="Instructions 会直接影响这个智能体后续处理任务的方式。">
        <SettingRow label="Instructions" description="说明角色、边界、输出风格和需要询问的情况。" wide><textarea className="instructions-editor" value={instructions} onChange={(event) => setInstructions(event.target.value)} aria-label="Instructions" /></SettingRow>
        <SettingRow label="模型" description="选项来自当前 Runtime 的真实能力目录。"><FabricSelect ariaLabel="模型" value={model} onValueChange={(value) => { setModel(value); const entry = selectedRuntime?.capabilities.modelCatalog?.find((item) => item.model === value); if (entry && !entry.thinkingLevels.includes(thinkingLevel as never)) setThinkingLevel(entry.thinkingLevels[0] ?? "medium"); }} options={[{ value: "", label: "Runtime 默认" }, ...(selectedRuntime?.capabilities.modelCatalog?.map((item) => ({ value: item.model, label: item.displayName })) ?? [])]} /></SettingRow>
        {selectedRuntime?.capabilities.supportsThinkingLevel && <SettingRow label="Thinking"><FabricSelect ariaLabel="Thinking Level" value={thinkingLevel} onValueChange={(value) => setThinkingLevel(value as NonNullable<AgentDraft["configuration"]["thinkingLevel"]>)} options={(selectedModel?.thinkingLevels ?? ["minimal", "low", "medium", "high", "xhigh"]).map((value) => ({ value, label: value }))} /></SettingRow>}
        {selectedRuntime?.capabilities.supportsServiceTier && <SettingRow label="服务等级"><FabricSelect ariaLabel="服务等级" value={serviceTier} onValueChange={(value) => setServiceTier(value as NonNullable<AgentDraft["configuration"]["serviceTier"]>)} options={(selectedModel?.serviceTiers ?? ["default", "flex", "priority"]).map((value) => ({ value, label: value }))} /></SettingRow>}
        <SettingRow label="最大并发" description="限制这个智能体同时处理的 A2A Task 数量。"><input type="number" min={1} max={64} value={maxConcurrentTasks} onChange={(event) => setMaxConcurrentTasks(Math.max(1, Math.min(64, Number(event.target.value) || 1)))} aria-label="最大并发任务" /></SettingRow>
      </SettingsSection>
      <SettingsSection title="运行与访问" description="Runtime 始终只有你可以绑定和管理；好友只获得 Agent 调用权。">
        <SettingRow label="Runtime"><FabricSelect ariaLabel="Runtime" value={runtimeId} onValueChange={(value) => { setRuntimeId(value); const nextRuntime = runtimes.find((runtime) => runtime.runtimeId === value); if (nextRuntime?.capabilities.modelCatalog && !nextRuntime.capabilities.modelCatalog.some((entry) => entry.model === model)) setModel(""); }} options={[{ value: "", label: "稍后绑定" }, ...runtimes.filter((runtime) => runtime.health === "ready").map((runtime) => ({ value: runtime.runtimeId, label: runtime.name }))]} /></SettingRow>
        <SettingRow label="访问权限"><FabricSelect ariaLabel="访问权限" value={permissionMode} onValueChange={(value) => setPermissionMode(value as AgentDraft["permissionMode"])} options={[{ value: "private", label: "仅自己" }, { value: "friends", label: "所有好友可访问" }]} /></SettingRow>
      </SettingsSection>
    </div>
  </PageSurface>;
}

function BuilderCreate({ snapshot, busy, run }: ViewProps) {
  const draft = snapshot.activeDraft;
  const [text, setText] = useState(draft?.pendingUserText ?? "");
  const savePendingText = () => draft ? run({ type: "draft-save", draftId: draft.draftId, update: { name: draft.name, description: draft.description, ...(draft.avatarUrl ? { avatarUrl: draft.avatarUrl } : {}), ...(draft.runtimeId ? { runtimeId: draft.runtimeId } : {}), permissionMode: draft.permissionMode, configuration: draft.configuration, pendingUserText: text, expectedVersion: draft.version } }) : Promise.resolve(false);
  useEffect(() => { if (!draft || !text.trim() || text === draft.pendingUserText || busy) return; const timer = window.setTimeout(() => void savePendingText(), 900); return () => window.clearTimeout(timer); }, [text, draft?.pendingUserText, draft?.version, busy]);
  if (!draft) return <PageSurface icon={Sparkles} title="AI Builder" description="正在恢复 Builder 草稿…"><LoadingRows count={3} /></PageSurface>;
  const send = async (event: FormEvent) => { event.preventDefault(); if (!text.trim()) return; const hadUnsavedText = text !== draft.pendingUserText; if (hadUnsavedText && !await savePendingText()) return; if (await run({ type: "draft-builder-turn", draftId: draft.draftId, text: text.trim(), expectedVersion: draft.version + (hadUnsavedText ? 1 : 0) })) setText(""); };
  return <PageSurface icon={Sparkles} title="AI Builder" description="通过对话准备配置；每次修改都会保存到服务端草稿。" back={() => void (async () => { if (text === draft.pendingUserText || await savePendingText()) await run({ type: "navigate", route: { name: "agent-create-choice" } }); })()} meta={<span className="save-state">草稿 v{draft.version}</span>}>
    {snapshot.draftValidation && !snapshot.draftValidation.valid && <div className="inline-state is-error builder-validation"><CircleAlert aria-hidden="true" /><span><strong>草稿还不完整</strong><small>{snapshot.draftValidation.fieldErrors.map((error) => draftFieldError(error.field)).join("；")}</small></span></div>}
    <div className="builder-layout"><section className="builder-conversation"><div className="builder-messages">{draft.builderSession?.conversation.length ? draft.builderSession.conversation.map((message) => <article className={`builder-message is-${message.role}`} key={message.messageId}><span>{message.role === "assistant" ? <Sparkles aria-hidden="true" /> : <IdentityMark name="你" small />}</span><p>{message.text}</p></article>) : <SurfaceState icon={WandSparkles} title="描述你需要的智能体" description="例如：帮团队分析需求、给出风险清单，并始终用中文简洁回答。" />}{draft.builderSession?.recoverableErrorCode && <div className="inline-state is-error"><CircleAlert aria-hidden="true" /><span><strong>Builder 暂时未完成这一步</strong><small>草稿和输入都已保留，检查 Runtime 后重新发送即可。</small></span></div>}</div><form className="builder-composer" onSubmit={(event) => void send(event)}><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="描述目标、边界或需要调整的内容…" aria-label="给 AI Builder 的消息" /><span className="composer-save-state">{text === draft.pendingUserText ? "输入已保存" : "正在保存输入…"}</span><FabricButton tone="primary" type="submit" loading={busy === "draft-builder-turn" || busy === "draft-save"} disabled={!text.trim()}>发送</FabricButton></form></section><aside className="draft-preview"><div><span>实时草稿</span><FabricStatus value={draft.builderSession?.state === "failed" ? "failed" : draft.builderSession?.state === "in_flight" ? "checking" : "ready"} /></div><h2>{draft.name || "未命名智能体"}</h2><p>{draft.description || "Builder 的下一次有效建议会显示在这里。"}</p><dl><dt>Runtime</dt><dd>{snapshot.runtimes.find((runtime) => runtime.runtimeId === draft.runtimeId)?.name ?? "未绑定"}</dd><dt>模型</dt><dd>{draft.configuration.model || "Runtime 默认"}</dd><dt>访问</dt><dd>{permissionLabel(draft.permissionMode)}</dd></dl><div className="preview-instructions"><span>Instructions</span><p>{draft.configuration.instructions || "尚未生成"}</p></div><FabricButton tone="primary" loading={busy === "draft-create-agent"} disabled={!draft.name.trim() || draft.builderSession?.state === "in_flight"} onClick={() => void run({ type: "draft-create-agent", draftId: draft.draftId, expectedVersion: draft.version, idempotencyKey: `desktop:builder:${draft.draftId}:${Date.now()}` })}>创建并打开智能体</FabricButton></aside></div>
  </PageSurface>;
}

function AgentDetail({ snapshot, busy, run }: ViewProps) {
  const detail = snapshot.detail;
  const saveSettingsRef = useRef<() => Promise<boolean>>(async () => true);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | undefined>();
  if (snapshot.route.name !== "agent-detail") return <LoadingRows />;
  if (!detail) return <AgentDetailLoading snapshot={snapshot} run={run} />;
  const section = snapshot.route.section;
  const requestNavigation = (action: () => void) => { if (settingsDirty) setPendingNavigation(() => action); else action(); };
  const setSection = (next: typeof section) => requestNavigation(() => void run({ type: "navigate", route: { name: "agent-detail", agentId: detail.identity.agentId, section: next } }));
  const finishNavigation = (save: boolean) => void (async () => {
    if (save && !await saveSettingsRef.current()) return;
    const action = pendingNavigation;
    setPendingNavigation(undefined);
    setSettingsDirty(false);
    action?.();
  })();
  const runtimeState = detail.identity.archivedAt ? "archived" : detail.runtime ? detail.runtime.health === "ready" ? "online" : detail.runtime.health === "checking" ? "unstable" : "offline" : "needs_runtime";
  return <div className="detail-surface"><header className="identity-header"><button className="back-button" aria-label="返回智能体列表" onClick={() => requestNavigation(() => void run({ type: "navigate", route: { name: "agents" } }))}><ArrowLeft aria-hidden="true" /></button><IdentityMark name={detail.identity.name} large /><div className="identity-copy"><p>智能体 / {detail.identity.name}</p><div><h1>{detail.identity.name}</h1><FabricStatus value={runtimeState} /></div><span>{detail.identity.description || "暂无描述"}</span><small><AgentFabricMark aria-hidden="true" />{detail.configuration.model || "Runtime 默认模型"}<Monitor aria-hidden="true" />{detail.runtime?.name ?? "未绑定 Runtime"}<Shield aria-hidden="true" />{accessLabel(detail.access.effectiveAccess)}<Clock3 aria-hidden="true" />更新于 {formatRelative(detail.identity.updatedAt)}</small></div><div className="identity-actions">{detail.access.canManage && (detail.identity.archivedAt ? <FabricButton loading={busy === "agent-restore"} onClick={() => void run({ type: "agent-restore", agentId: detail.identity.agentId, expectedVersion: detail.identity.version })}><RotateCcw aria-hidden="true" />恢复</FabricButton> : <FabricButton tone="quiet" loading={busy === "agent-archive"} onClick={() => void run({ type: "agent-archive", agentId: detail.identity.agentId, expectedVersion: detail.identity.version })}><Archive aria-hidden="true" />归档</FabricButton>)}</div></header><FabricTabs ariaLabel="智能体详情" value={section} onValueChange={setSection} items={detail.sections.map((item) => ({ value: item, label: sectionLabel(item) }))}>{(active) => <>{active === "overview" && <AgentOverview snapshot={snapshot} detail={detail} run={run} />}{active === "activity" && <AgentActivityView snapshot={snapshot} run={run} />}{active === "capabilities" && <AgentCapabilities snapshot={snapshot} detail={detail} busy={busy} run={run} />}{active === "settings" && <AgentSettings snapshot={snapshot} detail={detail} busy={busy} run={run} onDirtyChange={setSettingsDirty} registerSave={(handler) => { saveSettingsRef.current = handler ?? (async () => true); }} />}</>}</FabricTabs>{pendingNavigation && <DirtyGuardDialog busy={busy === "agent-update"} onCancel={() => setPendingNavigation(undefined)} onDiscard={() => finishNavigation(false)} onSave={() => finishNavigation(true)} />}</div>;
}

function AgentDetailLoading({ snapshot, run }: { readonly snapshot: AccountProductRendererSnapshot; readonly run: ViewProps["run"] }) {
  if (snapshot.route.name !== "agent-detail") return <LoadingRows />;
  const route = snapshot.route;
  const candidate = snapshot.catalog?.rows.find((item) => catalogAgentId(item) === route.agentId);
  const row = candidate && !("kind" in candidate) ? candidate : undefined;
  const retry = () => void run({ type: "agent-open", agentId: route.agentId, section: route.section });
  const setSection = (section: typeof route.section) => void run({ type: "navigate", route: { ...route, section } });
  const failed = fragmentState(snapshot, "detail") === "failed";
  return <div className="detail-surface"><header className="identity-header"><button className="back-button" aria-label="返回智能体列表" onClick={() => void run({ type: "navigate", route: { name: "agents" } })}><ArrowLeft aria-hidden="true" /></button><IdentityMark name={row?.agent.name ?? "智能体"} large /><div className="identity-copy"><p>智能体 / {row?.agent.name ?? "正在加载"}</p><div><h1>{row?.agent.name ?? "智能体详情"}</h1>{row && <FabricStatus value={row.status} />}</div><span>{row?.agent.description || "正在加载智能体详情…"}</span>{row && <small><AgentFabricMark aria-hidden="true" />{row.agent.model || "Runtime 默认模型"}<Monitor aria-hidden="true" />{row.runtime?.name ?? "未绑定 Runtime"}<Shield aria-hidden="true" />{accessLabel(row.effectiveAccess)}<Clock3 aria-hidden="true" />更新于 {formatRelative(row.agent.updatedAt)}</small>}</div></header><FabricTabs ariaLabel="智能体详情" value={route.section} onValueChange={setSection} items={(["overview", "activity", "capabilities", "settings"] as const).map((item) => ({ value: item, label: sectionLabel(item) }))}>{() => failed ? <SurfaceState icon={WifiOff} title="详情暂时无法加载" description="目录信息仍然可用，可以留在当前页面重试。" action={<FabricButton onClick={retry}><RefreshCw aria-hidden="true" />重试详情</FabricButton>} /> : <LoadingRows count={3} />}</FabricTabs></div>;
}

function AgentOverview({ snapshot, detail, run }: { readonly snapshot: AccountProductRendererSnapshot; readonly detail: NonNullable<AccountProductRendererSnapshot["detail"]>; readonly run: ViewProps["run"] }) {
  if (fragmentState(snapshot, "activities") !== "ready") return <AgentFragmentState snapshot={snapshot} fragment="activities" run={run} />;
  const active = snapshot.activities.filter((activity) => !["completed", "failed", "canceled"].includes(activity.terminalState));
  return <div className="overview-layout"><div className="overview-main"><OverviewBlock title="当前任务" meta={active.length ? `${active.length} 个处理中` : "没有运行中的任务"}>{active.length ? active.map((activity) => <ActivityLine key={activity.activityId} activity={activity} />) : <p className="quiet-copy">这个智能体目前没有执行任务。</p>}</OverviewBlock><OverviewBlock title="最近活动" meta={snapshot.activities.length ? `${snapshot.activities.length} 条记录` : "暂无完成记录"}>{snapshot.activities.slice(0, 5).map((activity) => <ActivityLine key={activity.activityId} activity={activity} />)}{snapshot.activities.length === 0 && <p className="quiet-copy">完成或失败的真实 A2A Task 会显示在这里。</p>}</OverviewBlock></div><aside className="facts-panel"><h2>智能体</h2><dl><dt>Owner</dt><dd>{snapshot.session.state === "signed-in" && snapshot.session.userId === detail.identity.ownerUserId ? snapshot.session.displayName : "—"}</dd><dt>访问</dt><dd>{accessLabel(detail.access.effectiveAccess)}</dd><dt>Runtime</dt><dd>{detail.runtime?.name ?? "未绑定"}</dd><dt>模型</dt><dd>{detail.configuration.model || "默认"}</dd><dt>并发</dt><dd>{detail.configuration.maxConcurrentTasks}</dd></dl><div><h3>能力</h3><p>{snapshot.skills?.skills.filter((item) => item.attached).length ?? 0} 个 Skill</p></div><div><h3>私有配置</h3><p>{detail.configuration.environment.configuredCount} 个环境变量 · 已隐藏</p></div></aside></div>;
}

function AgentActivityView({ snapshot, run }: { readonly snapshot: AccountProductRendererSnapshot; readonly run: ViewProps["run"] }) {
  if (fragmentState(snapshot, "activities") !== "ready") return <AgentFragmentState snapshot={snapshot} fragment="activities" run={run} />;
  return <section className="activity-table"><div className="section-title"><div><h2>活动</h2><p>只显示真实终态 A2A Task 的安全元数据。</p></div></div>{snapshot.activities.length ? snapshot.activities.map((activity) => <ActivityLine key={activity.activityId} activity={activity} detailed />) : <SurfaceState icon={Activity} title="暂无活动" description="这个智能体还没有完成或失败的任务。" />}</section>;
}

function AgentCapabilities({ snapshot, detail, busy, run }: { readonly snapshot: AccountProductRendererSnapshot; readonly detail: NonNullable<AccountProductRendererSnapshot["detail"]>; readonly busy: ViewProps["busy"]; readonly run: ViewProps["run"] }) {
  const skillsReady = fragmentState(snapshot, "skills") === "ready";
  return <div className="settings-column"><SettingsSection title="Instructions" description="定义智能体如何思考、回答和处理边界。"><SettingRow label="当前 Instructions" wide><div className="readout readout-multiline">{detail.configuration.instructions || "未配置"}</div></SettingRow></SettingsSection><SettingsSection title="Skills" description={snapshot.skills?.runtimeDiscovery.state === "offline" ? "Runtime 离线；已附加配置仍然可见。" : "Account Skills 与 Runtime Skills 使用同一列表管理。"}>{skillsReady ? snapshot.skills?.skills.length ? snapshot.skills.skills.map((item) => <SettingRow key={item.skill.skillId} label={item.skill.name} description={item.skill.description || `${item.skill.origin} Skill`}><FabricButton tone="quiet" loading={busy === "agent-skill-mutate"} disabled={!detail.access.canManage || !item.available} onClick={() => void run({ type: "agent-skill-mutate", agentId: detail.identity.agentId, skillId: item.skill.skillId, mutation: { action: item.attached ? "detach" : "attach", expectedVersion: snapshot.skills!.agentVersion } })}>{item.attached ? "移除" : "添加"}</FabricButton></SettingRow>) : <div className="section-empty">当前没有可用 Skill。</div> : <AgentFragmentState snapshot={snapshot} fragment="skills" run={run} />}</SettingsSection>{detail.runtime?.capabilities.supportsMcpConfiguration && <SettingsSection title="Agent MCP" description="这是智能体自身使用的 MCP 配置，与 Codex 调用 Agent Fabric 的 MCP 不同。"><SettingRow label="连接"><span className="readout">{detail.configuration.mcpConnections.length} 个已配置连接</span></SettingRow></SettingsSection>}</div>;
}

function AgentFragmentState({ snapshot, fragment, run }: { readonly snapshot: AccountProductRendererSnapshot; readonly fragment: "activities" | "skills"; readonly run: ViewProps["run"] }) {
  const state = fragmentState(snapshot, fragment);
  if (state === "loading") return <LoadingRows count={3} />;
  if (snapshot.route.name !== "agent-detail") return null;
  const route = snapshot.route;
  return <SurfaceState icon={WifiOff} title={fragment === "activities" ? "活动暂时无法加载" : "Skills 暂时无法加载"} description="其他详情仍然可用，可以在当前页面重试这一部分。" action={<FabricButton onClick={() => void run({ type: "agent-open", agentId: route.agentId, section: route.section })}><RefreshCw aria-hidden="true" />重试</FabricButton>} />;
}

function AgentSettings({ snapshot, detail, busy, run, onDirtyChange, registerSave }: { readonly snapshot: AccountProductRendererSnapshot; readonly detail: NonNullable<AccountProductRendererSnapshot["detail"]>; readonly busy: ViewProps["busy"]; readonly run: ViewProps["run"]; readonly onDirtyChange: (dirty: boolean) => void; readonly registerSave: (handler: (() => Promise<boolean>) | undefined) => void }) {
  const ownerName = snapshot.session.state === "signed-in" && snapshot.session.userId === detail.identity.ownerUserId ? snapshot.session.displayName : "—";
  const [name, setName] = useState(detail.identity.name);
  const [description, setDescription] = useState(detail.identity.description);
  const [runtimeId, setRuntimeId] = useState(detail.identity.runtimeId ?? "");
  const [permissionMode, setPermissionMode] = useState(detail.access.permissionMode);
  const [instructions, setInstructions] = useState(detail.configuration.instructions ?? "");
  const [model, setModel] = useState(detail.configuration.model ?? "");
  const [thinkingLevel, setThinkingLevel] = useState(detail.configuration.thinkingLevel ?? "medium");
  const [serviceTier, setServiceTier] = useState(detail.configuration.serviceTier ?? "default");
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(detail.configuration.maxConcurrentTasks);
  const runtime = snapshot.runtimes.find((item) => item.runtimeId === runtimeId);
  const dirty = name !== detail.identity.name || description !== detail.identity.description || runtimeId !== (detail.identity.runtimeId ?? "") || permissionMode !== detail.access.permissionMode || instructions !== (detail.configuration.instructions ?? "") || model !== (detail.configuration.model ?? "") || thinkingLevel !== (detail.configuration.thinkingLevel ?? "medium") || serviceTier !== (detail.configuration.serviceTier ?? "default") || maxConcurrentTasks !== detail.configuration.maxConcurrentTasks;
  const save = async () => {
    if (!name.trim()) return false;
    return run({ type: "agent-update", agentId: detail.identity.agentId, expectedVersion: detail.identity.version, update: {
      name, description, ...(detail.identity.avatarUrl ? { avatarUrl: detail.identity.avatarUrl } : {}), ...(runtimeId ? { runtimeId } : {}), permissionMode,
      configuration: { instructions, model: model || null, thinkingLevel: runtime?.capabilities.supportsThinkingLevel ? thinkingLevel : null, serviceTier: runtime?.capabilities.supportsServiceTier ? serviceTier : null, maxConcurrentTasks },
    } });
  };
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty]);
  useEffect(() => { registerSave(save); return () => registerSave(undefined); });
  const disabled = !detail.access.canManage || Boolean(detail.identity.archivedAt);
  return <div className="settings-column">
    <SettingsSection title="通用" description={detail.access.canManage ? "普通设置由服务端安全合并，不会覆盖已隐藏的私有配置。" : "你可以查看此智能体，但没有管理权限。"}>
      <SettingRow label="名称"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} disabled={disabled} /></SettingRow>
      <SettingRow label="描述"><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} disabled={disabled} /></SettingRow>
      <SettingRow label="Owner"><div className="readout">{ownerName}</div></SettingRow>
      <SettingRow label="Runtime"><FabricSelect ariaLabel="Runtime" value={runtimeId} onValueChange={setRuntimeId} disabled={disabled} options={[{ value: "", label: "未绑定" }, ...snapshot.runtimes.map((item) => ({ value: item.runtimeId, label: item.name }))]} /></SettingRow>
    </SettingsSection>
    <SettingsSection title="行为与访问" description="修改 Instructions、模型和可调用范围；管理权与调用权分别计算。">
      <SettingRow label="Instructions" wide><textarea className="instructions-editor" value={instructions} onChange={(event) => setInstructions(event.target.value)} disabled={disabled} /></SettingRow>
      <SettingRow label="模型"><FabricSelect ariaLabel="模型" value={model} onValueChange={setModel} disabled={disabled || !runtime?.capabilities.supportsModelSelection} options={[{ value: "", label: "Runtime 默认" }, ...(runtime?.capabilities.modelCatalog?.map((item) => ({ value: item.model, label: item.displayName })) ?? [])]} /></SettingRow>
      {runtime?.capabilities.supportsThinkingLevel && <SettingRow label="Thinking"><FabricSelect ariaLabel="Thinking" value={thinkingLevel} onValueChange={(value) => setThinkingLevel(value as typeof thinkingLevel)} disabled={disabled} options={(runtime.capabilities.modelCatalog?.find((item) => item.model === model)?.thinkingLevels ?? ["minimal", "low", "medium", "high", "xhigh"]).map((item) => ({ value: item, label: item }))} /></SettingRow>}
      {runtime?.capabilities.supportsServiceTier && <SettingRow label="服务等级"><FabricSelect ariaLabel="服务等级" value={serviceTier} onValueChange={(value) => setServiceTier(value as typeof serviceTier)} disabled={disabled} options={(runtime.capabilities.modelCatalog?.find((item) => item.model === model)?.serviceTiers ?? ["default", "flex", "priority"]).map((item) => ({ value: item, label: item }))} /></SettingRow>}
      <SettingRow label="最大并发"><input type="number" min={1} max={64} value={maxConcurrentTasks} onChange={(event) => setMaxConcurrentTasks(Math.max(1, Math.min(64, Number(event.target.value) || 1)))} disabled={disabled} /></SettingRow>
      <SettingRow label="访问权限" description="开启后，当前所有好友都能在 App 和 MCP 中发现并调用；解除好友关系会立即停止后续访问。"><FabricSelect ariaLabel="访问权限" value={permissionMode} onValueChange={(value) => setPermissionMode(value as typeof permissionMode)} disabled={disabled} options={[{ value: "private", label: "仅自己" }, { value: "friends", label: "所有好友可访问" }]} /></SettingRow>
      <div className="settings-actions"><span className={`save-state ${dirty ? "is-dirty" : ""}`}>{dirty ? "有未保存修改" : "已保存"}</span><FabricButton tone="primary" loading={busy === "agent-update"} disabled={disabled || !dirty || !name.trim()} onClick={() => void save()}>保存设置</FabricButton></div>
    </SettingsSection>
    <PrivateConfigurationEditor detail={detail} busy={busy} run={run} disabled={disabled} />
  </div>;
}

function PrivateConfigurationEditor({ detail, busy, run, disabled }: { readonly detail: NonNullable<AccountProductRendererSnapshot["detail"]>; readonly busy: ViewProps["busy"]; readonly run: ViewProps["run"]; readonly disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [environment, setEnvironment] = useState("");
  const [mcpCredentials, setMcpCredentials] = useState("{}");
  const [integrationCredentials, setIntegrationCredentials] = useState("{}");
  const [acknowledged, setAcknowledged] = useState(false);
  const supported = Boolean(detail.runtime && (detail.runtime.capabilities.supportsEnvironment || detail.runtime.capabilities.supportsMcpConfiguration || detail.runtime.capabilities.integrationProviders?.length));
  const submit = async () => {
    let configuration: Extract<AccountProductRendererCommand, { type: "agent-private-configuration-update" }>["update"]["configuration"];
    try { configuration = { environmentValues: parseEnvironmentValues(environment), mcpCredentials: parseCredentialJson(mcpCredentials), integrationCredentials: parseCredentialJson(integrationCredentials) }; }
    catch { toast.error("私有配置格式无效，请检查 KEY=value 或 JSON。", { id: "private-configuration-invalid" }); return; }
    if (await run({ type: "agent-private-configuration-update", agentId: detail.identity.agentId, update: { expectedVersion: detail.identity.version, idempotencyKey: `desktop:private:${detail.identity.agentId}:${Date.now()}`, configuration } })) {
      setEnvironment(""); setMcpCredentials("{}"); setIntegrationCredentials("{}"); setAcknowledged(false); setOpen(false);
      toast.success("私有配置已替换；值不会回显。", { id: "private-configuration-updated" });
    }
  };
  return <SettingsSection title="环境与凭据" description="秘密值不会进入普通详情或 Renderer Snapshot；替换操作使用独立的只写接口。">
    <SettingRow label="环境变量"><div className="readout">{detail.configuration.environment.configuredCount} 个键 · 值已隐藏</div></SettingRow>
    <SettingRow label="Agent MCP"><div className="readout">{detail.configuration.mcpConnections.filter((item) => item.configured).length} 个凭据集 · 值已隐藏</div></SettingRow>
    <SettingRow label="Integrations"><div className="readout">{detail.configuration.integrations.filter((item) => item.state === "configured").length} 个凭据集 · 值已隐藏</div></SettingRow>
    <SettingRow label="Runtime 配置"><div className="readout">{detail.configuration.runtimeConfiguration.configured ? "已配置 · 内容已隐藏" : "未配置"}</div></SettingRow>
    <SettingRow label="自定义参数"><div className="readout">{detail.configuration.customArguments.configuredCount} 项 · 内容已隐藏</div></SettingRow>
    {!open ? <div className="settings-actions"><small>不会读取现有秘密值。</small><FabricButton tone="quiet" disabled={disabled || !supported} onClick={() => setOpen(true)}>替换私有配置</FabricButton></div> : <div className="private-configuration-form"><div className="inline-state is-warning"><CircleAlert aria-hidden="true" /><span><strong>这是完整替换，不是追加</strong><small>留空会清除对应类别的现有值。保存后只显示数量，秘密值不会再次出现。</small></span></div><label><span>环境变量</span><small>每行一个 KEY=value</small><textarea value={environment} onChange={(event) => setEnvironment(event.target.value)} placeholder="SEARCH_TOKEN=…" autoComplete="off" spellCheck={false} /></label><label><span>Agent MCP 凭据 JSON</span><small>{detail.configuration.mcpConnections.map((item) => item.connectionId).join("、") || "当前没有 Agent MCP 连接"}</small><textarea value={mcpCredentials} onChange={(event) => setMcpCredentials(event.target.value)} autoComplete="off" spellCheck={false} /></label><label><span>Integration 凭据 JSON</span><small>{detail.configuration.integrations.map((item) => item.integrationId).join("、") || "当前没有 Integration"}</small><textarea value={integrationCredentials} onChange={(event) => setIntegrationCredentials(event.target.value)} autoComplete="off" spellCheck={false} /></label><FabricCheckbox className="acknowledge-row" ariaLabel="确认完整替换私有配置" checked={acknowledged} onCheckedChange={setAcknowledged}>我理解这会替换全部私有配置，且无法回显旧值。</FabricCheckbox><div className="settings-actions"><FabricButton onClick={() => setOpen(false)}>取消</FabricButton><FabricButton tone="primary" loading={busy === "agent-private-configuration-update"} disabled={!acknowledged} onClick={() => void submit()}>确认替换</FabricButton></div></div>}
  </SettingsSection>;
}

function RuntimeCatalog({ snapshot, busy, run }: ViewProps) {
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<"all" | AccountProductRendererSnapshot["runtimes"][number]["health"]>("all");
  const visible = snapshot.runtimes.filter((runtime) => (!search.trim() || `${runtime.name} ${runtime.provider} ${runtime.adapterId}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && (health === "all" || runtime.health === health));
  const table = useTable({ features: collectionTableFeatures, columns: [], data: visible, getRowId: (runtime) => runtime.runtimeId });
  const localRuntime = snapshot.runtimes.find((runtime) => runtime.runtimeId === snapshot.localServices.runtime.runtimeId);
  return <PageSurface collection icon={Monitor} title="运行时" count={snapshot.runtimes.length} description="本机和 Account 中为智能体提供真实执行能力的 Runtime。" action={<FabricButton loading={busy === "runtime-refresh"} disabled={!localRuntime} onClick={() => localRuntime && void run({ type: "runtime-refresh", runtimeId: localRuntime.runtimeId, expectedVersion: localRuntime.version })}><RefreshCw aria-hidden="true" />刷新本机检测</FabricButton>}>
    <div className="runtime-toolbar"><form className="catalog-search" role="search" onSubmit={(event) => event.preventDefault()}><Search aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 Runtime…" aria-label="搜索 Runtime" />{search && <button type="button" aria-label="清除 Runtime 搜索" onClick={() => setSearch("")}><X aria-hidden="true" /></button>}</form><label className="toolbar-select"><Filter aria-hidden="true" /><span className="sr-only">Runtime 状态</span><FabricSelect compact ariaLabel="Runtime 状态" value={health} onValueChange={(value) => setHealth(value as typeof health)} options={[{ value: "all", label: "全部状态" }, { value: "ready", label: "可用" }, { value: "checking", label: "检查中" }, { value: "auth_required", label: "需要认证" }, { value: "offline", label: "离线" }, { value: "unavailable", label: "不可用" }]} /></label></div>
    {visible.length ? <div className="resource-roster runtime-roster collection-roster"><div className="roster-head"><span>Runtime</span><span>健康状态</span><span>可见性</span><span>能力</span><span>最近检测</span><span /></div><div className="collection-rows">{table.getRowModel().rows.map(({ id, original: runtime }) => <button className="runtime-row" key={id} onClick={() => void run({ type: "runtime-open", runtimeId: runtime.runtimeId })}><span className="runtime-symbol"><TerminalSquare aria-hidden="true" /></span><span className="runtime-name"><strong>{runtime.name}</strong><small>{runtime.provider} · {runtime.adapterId}</small></span><FabricStatus value={runtime.health} /><span>仅自己</span><span>{capabilityCount(runtime.capabilities)} 项</span><span>{formatRelative(runtime.lastCheckedAt)}</span><ChevronRight aria-hidden="true" /></button>)}</div><div className="collection-footer"><span>显示 {visible.length} 个 Runtime</span><span>{health === "all" ? "全部状态" : "已筛选"}</span></div></div> : snapshot.runtimes.length ? <SurfaceState icon={Search} title="没有匹配的 Runtime" description="调整名称或状态筛选后再试。" action={<FabricButton onClick={() => { setSearch(""); setHealth("all"); }}>清除条件</FabricButton>} /> : <SurfaceState icon={Monitor} title="未检测到 Runtime" description="安装并登录支持的 Codex Runtime 后，回到这里刷新检测。" />}
  </PageSurface>;
}

function RuntimeDetail({ snapshot, busy, run }: ViewProps) {
  const runtime = snapshot.runtimeDetail;
  if (!runtime) return <LoadingRows />;
  return <RuntimeDetailLoaded snapshot={snapshot} busy={busy} run={run} runtime={runtime} />;
}

function RuntimeDetailLoaded({ snapshot, busy, run, runtime }: ViewProps & { readonly runtime: NonNullable<AccountProductRendererSnapshot["runtimeDetail"]> }) {
  const [name, setName] = useState(runtime.name);
  const visibility = runtime.visibility;
  const canManage = snapshot.session.state === "signed-in" && snapshot.session.userId === runtime.ownerUserId;
  const isLocal = snapshot.localServices.runtime.runtimeId === runtime.runtimeId;
  const dirty = name !== runtime.name || visibility !== runtime.visibility;
  return <PageSurface icon={Monitor} title={runtime.name} description={`${runtime.provider} · ${runtime.adapterId}`} back={() => void run({ type: "navigate", route: { name: "runtimes" } })} meta={<FabricStatus value={runtime.health} />} action={<div className="header-actions"><FabricButton loading={busy === "runtime-refresh"} disabled={!isLocal || runtime.health === "checking"} onClick={() => void run({ type: "runtime-refresh", runtimeId: runtime.runtimeId, expectedVersion: runtime.version })}><RefreshCw aria-hidden="true" />重新检测</FabricButton><FabricButton tone="danger" disabled={!canManage} onClick={() => void run({ type: "runtime-delete-plan", runtimeId: runtime.runtimeId })}><Trash2 aria-hidden="true" />删除</FabricButton></div>}>
    {!isLocal && <div className="inline-state is-warning runtime-auth-guidance"><CircleAlert aria-hidden="true" /><span><strong>需在 Runtime 所在设备检测</strong><small>这台设备不会改写远端 Runtime 的健康状态。</small></span></div>}
    {runtime.health === "auth_required" && <div className="inline-state is-warning runtime-auth-guidance"><CircleAlert aria-hidden="true" /><span><strong>Runtime 需要本地认证</strong><small>请在这台设备的终端完成 {runtime.provider} 登录；Agent Fabric 不接收账号密码。完成后点击“重新检测”。</small></span></div>}
    {isLocal && (runtime.health === "unavailable" || runtime.health === "offline") && <div className="inline-state is-error runtime-auth-guidance"><CircleAlert aria-hidden="true" /><span><strong>本机 Runtime 当前不可用</strong><small>确认 ChatGPT 已安装并登录后重新检测；私有路径和原始错误不会上传。</small></span></div>}
    <div className="settings-column"><SettingsSection title="Runtime" description="Runtime、会话与本地凭据始终仅你可见；好友不会获得绑定或管理权。"><SettingRow label="名称"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} disabled={!canManage} /></SettingRow><SettingRow label="健康状态"><FabricStatus value={runtime.health} /></SettingRow><SettingRow label="可见性"><div className="readout">仅自己</div></SettingRow><SettingRow label="最近检测"><div className="readout">{formatDate(runtime.lastCheckedAt)}</div></SettingRow><div className="settings-actions"><span className={`save-state ${dirty ? "is-dirty" : ""}`}>{dirty ? "有未保存修改" : "已保存"}</span><FabricButton tone="primary" loading={busy === "runtime-update"} disabled={!canManage || !dirty || !name.trim()} onClick={() => void run({ type: "runtime-update", runtimeId: runtime.runtimeId, name, visibility, expectedVersion: runtime.version })}>保存 Runtime</FabricButton></div></SettingsSection><SettingsSection title="能力"><SettingRow label="模型选择"><CheckValue value={runtime.capabilities.supportsModelSelection} /></SettingRow><SettingRow label="Thinking"><CheckValue value={runtime.capabilities.supportsThinkingLevel} /></SettingRow><SettingRow label="Skills"><CheckValue value={runtime.capabilities.supportsSkills} /></SettingRow><SettingRow label="并发智能体"><div className="readout">最多 {runtime.capabilities.maxConcurrentAgents} 个</div></SettingRow></SettingsSection></div>
    {snapshot.runtimeDeletionImpact && <ImpactDialog title={`删除 ${runtime.name}？`} description={`将解绑 ${snapshot.runtimeDeletionImpact.boundAgentIds.length} 个智能体；其中 ${snapshot.runtimeDeletionImpact.activeAgentIds.length} 个正在执行工作。智能体本身和配置不会被删除。`} confirm="删除并解绑" busy={busy === "runtime-delete-confirm"} onCancel={() => void run({ type: "runtime-open", runtimeId: runtime.runtimeId })} onConfirm={() => void run({ type: "runtime-delete-confirm", runtimeId: runtime.runtimeId, confirmation: { planId: snapshot.runtimeDeletionImpact!.planId, expectedRuntimeVersion: snapshot.runtimeDeletionImpact!.expectedRuntimeVersion } })} />}
  </PageSurface>;
}

function FriendsSurface({ snapshot, busy, run }: ViewProps) {
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const invite = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    void (async () => {
      if (await run({ type: "friend-invite", invitation: { email: email.trim(), expiresAt } })) {
        setEmail("");
        toast.success("好友邀请已发送。", { id: "friend-invited" });
      }
    })();
  };
  const friends = snapshot.friends.filter((item) => !search.trim() || `${item.friend.displayName} ${item.friend.email}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const incoming = snapshot.incomingFriendInvitations.filter((item) => item.invitation.status === "pending");
  const outgoing = snapshot.outgoingFriendInvitations.filter((item) => item.invitation.status === "pending");
  return <PageSurface collection icon={Users} title="好友" count={snapshot.friends.length} description="好友关系属于两个人，不会加入、管理或切换彼此的 Account。">
    <form className="invite-panel" onSubmit={invite}><div><UserPlus aria-hidden="true" /><span><strong>添加好友</strong><small>对方登录后会在邀请收件箱看到记录，接受即可建联。</small></span></div><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="friend@example.com" aria-label="好友邮箱" required /><FabricButton tone="primary" type="submit" loading={busy === "friend-invite"} disabled={!email.trim()}>发送邀请</FabricButton></form>
    {incoming.length > 0 && <section className="friend-invitations" aria-label="收到的好友邀请"><div className="friend-section-heading"><h2>收到的邀请</h2><p>接受后成为双向好友，不会进入对方 Account。</p></div><div className="friend-roster">{incoming.map(({ invitation, otherHuman }) => <div className="friend-row" key={invitation.invitationId}><IdentityMark name={otherHuman?.displayName ?? invitation.recipientEmail} /><span><strong>{otherHuman?.displayName ?? "好友邀请"}</strong><small>{otherHuman?.email ?? invitation.recipientEmail} · 有效期至 {formatDate(invitation.expiresAt)}</small></span><div className="friend-row-actions"><FabricButton tone="quiet" loading={busy === "friend-invitation-reject"} onClick={() => void run({ type: "friend-invitation-reject", invitationId: invitation.invitationId, expectedVersion: invitation.version })}>拒绝</FabricButton><FabricButton tone="primary" loading={busy === "friend-invitation-accept"} onClick={() => void run({ type: "friend-invitation-accept", invitationId: invitation.invitationId, expectedVersion: invitation.version })}>接受</FabricButton></div></div>)}</div></section>}
    <div className="resource-roster collection-roster friend-collection">
      <header className="friend-collection-header"><div><h2>好友</h2><p>{friends.length} 位匹配好友</p></div><form className="friend-search" role="search" onSubmit={(event) => event.preventDefault()}><Search aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索好友…" aria-label="搜索好友" />{search && <button type="button" aria-label="清除好友搜索" onClick={() => setSearch("")}><X aria-hidden="true" /></button>}</form></header>
      <div className="collection-rows friend-collection-rows"><section aria-label="好友列表">{friends.length ? <div className="friend-roster">{friends.map((item) => <div className="friend-row" key={item.friendshipId}><IdentityMark name={item.friend.displayName} /><span><strong>{item.friend.displayName}</strong><small>{item.friend.email} · 成为好友于 {formatDate(item.since)}</small></span><span className="status-chip">好友</span><FabricButton tone="danger" loading={busy === "friend-remove"} onClick={() => void run({ type: "friend-remove", friendshipId: item.friendshipId, expectedVersion: item.relationshipVersion })}>解除好友</FabricButton></div>)}</div> : <SurfaceState icon={Search} title="还没有好友" description="发送邀请，或接受收到的好友邀请。" />}</section>
      {outgoing.length > 0 && <section className="friend-invitations" aria-label="已发送好友邀请"><div className="friend-section-heading"><h2>已发送</h2><p>对方接受前可以撤销。</p></div><div className="friend-roster">{outgoing.map(({ invitation, otherHuman }) => <div className="friend-row" key={invitation.invitationId}><span className="pending-disc"><Clock3 aria-hidden="true" /></span><span><strong>{otherHuman?.displayName ?? invitation.recipientEmail}</strong><small>{invitation.recipientEmail} · 有效期至 {formatDate(invitation.expiresAt)}</small></span><span className="status-chip">待接受</span><FabricButton tone="quiet" loading={busy === "friend-invitation-revoke"} onClick={() => void run({ type: "friend-invitation-revoke", invitationId: invitation.invitationId, expectedVersion: invitation.version })}>撤销</FabricButton></div>)}</div></section>}
      </div><div className="collection-footer"><span>显示 {friends.length} 位好友</span><span>{incoming.length} 个收到的邀请 · {outgoing.length} 个已发送邀请</span></div>
    </div>
  </PageSurface>;
}

function PageSurface({ icon: Icon, title, count, description, action, back, meta, footer, collection = false, children }: { readonly icon: LucideIcon; readonly title: string; readonly count?: number; readonly description?: string; readonly action?: ReactNode; readonly back?: () => void; readonly meta?: ReactNode; readonly footer?: ReactNode; readonly collection?: boolean; readonly children: ReactNode }) {
  return <section className={`page-surface ${footer ? "has-sticky-footer" : ""} ${collection ? "is-collection" : ""}`}><header className="resource-header">{back && <button className="back-button" aria-label="返回" onClick={back}><ArrowLeft aria-hidden="true" /></button>}<Icon className="resource-icon" aria-hidden="true" /><div><span><h1>{title}</h1>{count !== undefined && <b>{count}</b>}</span>{description && <p>{description}</p>}</div>{meta && <div className="resource-meta">{meta}</div>}{action && <div className="resource-action">{action}</div>}</header><div className="page-content">{children}</div>{footer && <footer className="sticky-footer">{footer}</footer>}</section>;
}

function SettingsSection({ title, description, children }: { readonly title: string; readonly description?: string; readonly children: ReactNode }) { return <section className="settings-section"><div className="section-title"><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div><div className="settings-group">{children}</div></section>; }
function OverviewBlock({ title, meta, children }: { readonly title: string; readonly meta: string; readonly children: ReactNode }) { return <section className="overview-block"><div className="section-title"><div><h2>{title}</h2><p>{meta}</p></div></div><div>{children}</div></section>; }
function ActivityLine({ activity, detailed = false }: { readonly activity: AccountProductRendererSnapshot["activities"][number]; readonly detailed?: boolean }) { return <div className={`activity-line ${detailed ? "is-detailed" : ""}`}><FabricStatus value={activity.terminalState} /><span><strong>{activity.taskId}</strong><small>{formatDate(activity.completedAt)}</small></span>{detailed && <span>{Math.round(activity.durationMs / 1000)} 秒</span>}{activity.failureCategory && <small>{activity.failureCategory}</small>}</div>; }
function MethodCard({ icon: Icon, title, description, recommended, busy, onClick }: { readonly icon: LucideIcon; readonly title: string; readonly description: string; readonly recommended?: boolean; readonly busy?: boolean; readonly onClick: () => void }) { return <button className="method-card" onClick={onClick} disabled={busy}><span className="method-icon">{busy ? <RefreshCw className="fabric-spinner" aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>{recommended && <b>推荐</b>}<strong>{title}</strong><p>{description}</p><small>继续 <ChevronRight aria-hidden="true" /></small></button>; }
function NavItem({ icon: Icon, label, active, onClick }: { readonly icon: LucideIcon; readonly label: string; readonly active: boolean; readonly onClick: () => void }) { return <button aria-current={active ? "page" : undefined} onClick={onClick}><Icon aria-hidden="true" /><span>{label}</span></button>; }
function ServiceLine({ label, value }: { readonly label: string; readonly value: string }) { const good = value === "ready" || value === "online"; return <div><i className={good ? "is-good" : value === "reconnecting" ? "is-warn" : ""} /><span>{label}</span><small>{value === "ready" ? "可用" : value === "online" ? "在线" : value === "reconnecting" ? "重连中" : value === "failed" ? "异常" : "离线"}</small></div>; }
function IdentityMark({ name, small = false, large = false }: { readonly name: string; readonly small?: boolean; readonly large?: boolean }) { return <span className={`identity-mark ${small ? "is-small" : ""} ${large ? "is-large" : ""}`} aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || "A"}</span>; }
function CheckValue({ value }: { readonly value: boolean }) { return <span className={`check-value ${value ? "is-yes" : ""}`}>{value ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}{value ? "支持" : "不支持"}</span>; }

function ImpactDialog({ title, description, confirm, busy, onCancel, onConfirm }: { readonly title: string; readonly description: string; readonly confirm: string; readonly busy: boolean; readonly onCancel: () => void; readonly onConfirm: () => void }) { return <FabricDialog open onOpenChange={(open) => { if (!open) onCancel(); }} role="alertdialog" ariaLabelledBy="impact-title" ariaDescribedBy="impact-description" popupClassName="impact-dialog"><span className="impact-icon"><CircleAlert aria-hidden="true" /></span><h2 id="impact-title">{title}</h2><p id="impact-description">{description}</p><div><FabricButton autoFocus onClick={onCancel}>取消</FabricButton><FabricButton tone="danger" loading={busy} onClick={onConfirm}>{confirm}</FabricButton></div></FabricDialog>; }
function DirtyGuardDialog({ busy, onCancel, onDiscard, onSave }: { readonly busy: boolean; readonly onCancel: () => void; readonly onDiscard: () => void; readonly onSave: () => void }) { return <FabricDialog open onOpenChange={(open) => { if (!open) onCancel(); }} role="alertdialog" ariaLabelledBy="dirty-title" ariaDescribedBy="dirty-description" popupClassName="impact-dialog"><span className="impact-icon is-neutral"><CircleAlert aria-hidden="true" /></span><h2 id="dirty-title">保存设置修改？</h2><p id="dirty-description">离开此页面前，可以保存修改、放弃修改或继续编辑。</p><div><FabricButton autoFocus onClick={onCancel}>继续编辑</FabricButton><FabricButton tone="quiet" onClick={onDiscard}>放弃修改</FabricButton><FabricButton tone="primary" loading={busy} onClick={onSave}>保存并继续</FabricButton></div></FabricDialog>; }
function MigrationNotice({ snapshot, run }: { readonly snapshot: AccountProductRendererSnapshot; readonly run: ViewProps["run"] }) { const recovery = snapshot.legacyRecovery; if (recovery.state !== "needs_attention") return null; const complete = () => void run({ type: "legacy-recovery-complete", backupId: recovery.backupId, acknowledgedFields: recovery.unmappedPrivateFields }); return <div className="migration-notice" role="status"><CircleAlert aria-hidden="true" /><span><strong>旧 Agent 已迁移</strong><small>部分私有字段留在本机备份，需要你确认后继续。</small></span><FabricButton tone="quiet" onClick={complete}>确认迁移结果</FabricButton></div>; }
function BootstrapScreen() { return <main className="bootstrap-screen"><span className="brand-symbol"><AgentFabricMark aria-hidden="true" /></span><div><h1>Agent Fabric</h1><p>正在恢复 Account、Runtime 与智能体目录…</p></div><LoadingRows count={3} /></main>; }
function LoginScreen({ snapshot, busy, onLogin }: { readonly snapshot: AccountProductRendererSnapshot; readonly busy: boolean; readonly onLogin: () => void }) { return <main className="login-screen"><section className="login-panel"><span className="brand-symbol"><AgentFabricMark aria-hidden="true" /></span><h1>登录 Agent Fabric</h1><p>管理你的智能体与 Runtime，并通过好友关系共享可访问的智能体。</p><FabricButton tone="primary" loading={busy} onClick={onLogin}><LogIn aria-hidden="true" />{busy ? "正在完成登录" : "使用 Google 登录"}</FabricButton><small><KeyRound aria-hidden="true" />登录在系统浏览器完成，App 不接收 Google 密码。</small>{snapshot.errorCode && <div className="login-error" role="alert"><CircleAlert aria-hidden="true" /><span>{loginErrorMessage(snapshot.errorCode)}</span></div>}</section><div className="login-foot">Agent Fabric · 本地 Runtime 与私有凭据留在这台设备</div></main>; }

function loginErrorMessage(code: string): string {
  if (code === "http-404") return "服务版本不兼容，请升级服务后重试。";
  if (code === "server-unreachable") return "无法连接服务，请检查网络后重试。";
  if (code === "login-cancelled" || code === "login_cancelled") return "登录已取消，你可以重新登录。";
  if (code === "login-callback-timeout") return "登录等待已超时，请重新发起登录。";
  if (code === "login-callback-invalid") return "登录回调无效，请关闭浏览器页面后重试。";
  if (code === "login-exchange-failed") return "Google 登录结果无法完成验证，请重试。";
  if (code === "login-session-invalid") return "账号会话未能建立，请重试；持续失败请更新 App。";
  if (code === "login-cloud-incompatible") return "Cloud 版本与当前 App 不兼容，请等待服务更新后重试。";
  if (code === "login-bootstrap-failed") return "账号已验证，但首屏数据加载失败，请重试。";
  if (code === "login-secure-storage-failed") return "无法安全保存登录状态，请检查系统钥匙串后重试。";
  return "登录未完成，请重试。";
}

interface ViewProps { readonly snapshot: AccountProductRendererSnapshot; readonly busy: AccountProductRendererCommand["type"] | undefined; readonly run: (command: AccountProductRendererCommand) => Promise<boolean> }
function initialSnapshot(): AccountProductRendererSnapshot { return { session: { state: "signed-out", reason: "initial" }, route: { name: "agents" }, connection: "offline", localServices: { runtime: { state: "inactive" }, mcp: { state: "inactive" } }, activities: [], templates: [], drafts: [], runtimes: [], friends: [], incomingFriendInvitations: [], outgoingFriendInvitations: [], legacyRecovery: { state: "not_required" }, loading: true, refreshing: false }; }
function routeRoot(name: AccountProductRendererSnapshot["route"]["name"]): "agents" | "runtimes" | "friends" { return name.startsWith("agent") ? "agents" : name.startsWith("runtime") ? "runtimes" : "friends"; }
function scopeLabel(value: "mine" | "friends" | "archived") { return value === "mine" ? "我的" : value === "friends" ? "好友开放" : "已归档"; }
function sectionLabel(value: "overview" | "activity" | "capabilities" | "settings") { return value === "overview" ? "概览" : value === "activity" ? "活动" : value === "capabilities" ? "能力" : "设置"; }
function fragmentState(snapshot: AccountProductRendererSnapshot, fragment: "detail" | "activities" | "skills") { return snapshot.route.name === "agent-detail" && snapshot.agentLoad?.agentId === snapshot.route.agentId ? snapshot.agentLoad[fragment] : "ready"; }
function permissionLabel(value: string) { return value === "private" ? "仅自己" : "所有好友可访问"; }
function accessLabel(value: string) { return value === "owner" ? "我拥有" : value === "friend" ? "好友开放" : "不可调用"; }
function catalogAgentId(row: NonNullable<AccountProductRendererSnapshot["catalog"]>["rows"][number]): string { return "kind" in row ? row.agentId : row.agent.agentId; }
function draftFieldError(value: string) { return ({ name: "请填写名称", runtimeId: "请选择可用 Runtime", model: "模型与 Runtime 不兼容", thinkingLevel: "Thinking 选项不受支持", serviceTier: "服务等级不受支持", environment: "环境变量不受 Runtime 支持", customArguments: "自定义参数不受 Runtime 支持", runtimeConfiguration: "Runtime 配置不受支持", access: "请完成访问权限配置", templateId: "模板已不可用", draft: "草稿状态已变化，请刷新" } as Record<string, string>)[value] ?? "请检查草稿配置"; }
function parseEnvironmentValues(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean)) {
    const separator = line.indexOf("=");
    const key = separator < 0 ? "" : line.slice(0, separator).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/u.test(key)) throw new Error("private-environment-invalid");
    result[key] = line.slice(separator + 1);
  }
  return result;
}
function parseCredentialJson(value: string): Record<string, Record<string, string>> {
  const parsed = JSON.parse(value || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("private-credentials-invalid");
  const result: Record<string, Record<string, string>> = {};
  for (const [resourceId, secrets] of Object.entries(parsed)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(resourceId) || !secrets || typeof secrets !== "object" || Array.isArray(secrets)) throw new Error("private-credentials-invalid");
    const entries = Object.entries(secrets);
    if (entries.some(([key, secret]) => !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(key) || typeof secret !== "string" || !secret)) throw new Error("private-credentials-invalid");
    result[resourceId] = Object.fromEntries(entries) as Record<string, string>;
  }
  return result;
}
function capabilityCount(value: Record<string, unknown>) { return Object.values(value).filter((item) => item === true).length; }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
function formatRelative(value?: string) { if (!value) return "—"; const delta = Date.now() - Date.parse(value); if (delta < 60_000) return "刚刚"; if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`; if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`; return formatDate(value); }
function errorMessage(error: unknown) { const value = error instanceof Error ? error.message : "account-product-operation-failed"; return ({ "authentication-required": "登录已过期，请重新登录。", "account-agent-version-conflict": "此智能体已在其他位置修改，请刷新后重试。", "runtime-authentication-required": "Runtime 需要先完成本地认证。", "runtime-refresh-not-local": "请在 Runtime 所在设备执行检测。" } as Record<string, string>)[value] ?? "操作未完成，数据已保留，请重试。"; }
