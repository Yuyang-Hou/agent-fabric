// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountProductApp } from "./app.js";
import { createAccountProductFixtureBridge } from "./fixture.js";

afterEach(cleanup);

describe("Account-scoped product Renderer", () => {
  it("exposes only Agents, Runtimes and Friends as primary destinations", () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge()} />);
    expect(document.querySelector("[data-window-drag-region]")?.getAttribute("aria-hidden")).toBe("true");
    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(Array.from(navigation.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["智能体", "运行时", "好友"]);
    expect(navigation.querySelector("[data-agent-fabric-mark]")).toBeTruthy();
    expect(screen.queryByText(/Agent 好友|消息动态|工作区|任务板/u)).toBeNull();
  });

  it("renders the dense multi-Agent catalog and opens a precise Agent detail", async () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge()} />);
    expect(screen.getByText("Agent Fabric Helper")).toBeTruthy();
    expect(screen.getByText("Release Reviewer")).toBeTruthy();
    expect(screen.getByText("Knowledge Curator")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Agent Fabric Helper\s+回答产品/u }));
    await waitFor(() => expect(screen.getByRole("tablist", { name: "智能体详情" })).toBeTruthy());
    expect(screen.getAllByText("Agent Fabric Helper").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "概览" }).getAttribute("aria-selected")).toBe("true");
  });

  it("renders a catalog-backed detail header immediately while fragments load", () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("detail-loading")} />);
    expect(screen.getByRole("heading", { name: "Agent Fabric Helper" })).toBeTruthy();
    expect(screen.getByText("回答产品、架构和当前实现相关问题。")).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "智能体详情" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "正在加载" })).toBeTruthy();
  });

  it("changes detail tabs with local navigation instead of reopening the Agent", async () => {
    const commands: Array<{ type: string }> = [];
    const onCommand = vi.fn((command: { type: string }) => commands.push(command));
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("agents", onCommand)} />);
    fireEvent.click(screen.getByRole("button", { name: /Agent Fabric Helper\s+回答产品/u }));
    await screen.findByRole("tablist", { name: "智能体详情" });
    fireEvent.click(screen.getByRole("tab", { name: "活动" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "活动" }).getAttribute("aria-selected")).toBe("true"));
    expect(commands.map((command) => command.type)).toEqual(["agent-open", "navigate"]);
  });

  it("keeps blank, template and AI Builder creation as separate recoverable paths", async () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("create")} />);
    expect(screen.getByRole("button", { name: /从空白开始/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /使用 AI Builder/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /研究助手/u })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /使用 AI Builder/u }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "给 AI Builder 的消息" })).toBeTruthy());
    expect(screen.getByText("实时草稿")).toBeTruthy();
  });

  it("shows friend invitations and relationships without Account roles", async () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge()} />);
    fireEvent.click(screen.getByRole("button", { name: "运行时" }));
    await waitFor(() => expect(screen.getByText("Nick 的 Mac")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "好友" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "好友", level: 1 })).toBeTruthy());
    expect(screen.getByRole("textbox", { name: "好友邮箱" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "收到的好友邀请" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "接受" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeTruthy();
    expect(screen.getByText("new.friend@example.com")).toBeTruthy();
    expect(screen.queryByText(/管理员|成员角色/u)).toBeNull();
  });

  it("shows a safe read-only summary for Agents opened by friends", async () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge()} />);
    fireEvent.click(screen.getByRole("button", { name: /好友开放/u }));
    expect(await screen.findByText("Ami Research Agent")).toBeTruthy();
    expect(screen.getByText("Ami Lin")).toBeTruthy();
    expect(screen.getByText("网页检索 · 资料总结")).toBeTruthy();
    expect(screen.getByText("只读")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/runtime:friend|private instruction|credential/iu);
    expect(screen.queryByRole("button", { name: /Ami Research Agent/u })).toBeNull();
  });

  it("uses mature primitives and a full-height collection frame for the catalog", async () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge()} />);
    expect(document.querySelector("select")).toBeNull();
    expect(screen.getByRole("heading", { name: "智能体" }).closest(".page-surface")?.classList.contains("is-collection")).toBe(true);
    expect(screen.getByText("显示 3 个智能体")).toBeTruthy();
    const checkbox = screen.getByRole("checkbox", { name: "选择 Agent Fabric Helper" });
    const nativeCheckbox = checkbox.parentElement?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(nativeCheckbox).toBeTruthy();
    fireEvent.click(nativeCheckbox!);
    expect(await screen.findByText("已选择 1 个智能体")).toBeTruthy();
    expect(screen.getByRole("button", { name: "批量归档" })).toBeTruthy();
  });

  it("keeps login a single focused Google task", () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("login")} />);
    expect(document.querySelector(".brand-symbol [data-agent-fabric-mark]")).toBeTruthy();
    expect(screen.getByRole("button", { name: /使用 Google 登录/u })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/密码登录|验证码/u)).toBeNull();
  });

  it("distinguishes an outdated service from a network failure", () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("login-incompatible")} />);
    expect(screen.getByRole("alert").textContent).toContain("服务版本不兼容");
    expect(screen.queryByText(/检查网络/u)).toBeNull();
  });

  it("keeps login pending until activation and gives secure-storage recovery", () => {
    const pending = render(<AccountProductApp bridge={createAccountProductFixtureBridge("login-pending")} />);
    expect(screen.getByRole("button", { name: /正在完成登录/u })).toBeTruthy();
    pending.unmount();
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("login-storage-failed")} />);
    expect(screen.getByRole("alert").textContent).toContain("系统钥匙串");
  });

  it("guards dirty Agent settings with save, discard and continue-editing choices", async () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("detail")} />);
    fireEvent.click(screen.getByRole("tab", { name: "设置" }));
    await waitFor(() => expect(screen.getByDisplayValue("Agent Fabric Helper")).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue("Agent Fabric Helper"), { target: { value: "Renamed Helper" } });
    const overview = screen.getByRole("tab", { name: "概览" });
    overview.focus();
    fireEvent.click(overview);
    const dialog = await screen.findByRole("alertdialog", { name: "保存设置修改？" });
    expect(within(dialog).getByRole("button", { name: "继续编辑" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "放弃修改" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "保存并继续" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "继续编辑" }));
    await waitFor(() => expect(document.activeElement).toBe(overview));
    fireEvent.click(overview);
    const reopened = await screen.findByRole("alertdialog", { name: "保存设置修改？" });
    fireEvent.click(within(reopened).getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "概览" }).getAttribute("aria-selected")).toBe("true"));
  });

  it("keeps private Agent configuration write-only and explicit about replacement", async () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("detail")} />);
    fireEvent.click(screen.getByRole("tab", { name: "设置" }));
    fireEvent.click(await screen.findByRole("button", { name: "替换私有配置" }));
    expect(screen.getByText("这是完整替换，不是追加")).toBeTruthy();
    expect(screen.queryByDisplayValue(/SEARCH_SCOPE|private/iu)).toBeNull();
    expect(screen.getByRole("button", { name: "确认替换" }).hasAttribute("disabled")).toBe(true);
  });

  it("supports Runtime no-match recovery and direct friend removal", async () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("runtimes")} />);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索 Runtime" }), { target: { value: "missing" } });
    expect(await screen.findByText("没有匹配的 Runtime")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清除条件" }));
    fireEvent.click(screen.getByRole("button", { name: "好友" }));
    expect(await screen.findByRole("button", { name: "解除好友" })).toBeTruthy();
  });

  it("refreshes only the active local Runtime and exposes it to Agent creation", async () => {
    render(<AccountProductApp bridge={createAccountProductFixtureBridge("runtimes")} />);
    expect(screen.getByRole("button", { name: "刷新本机检测" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Nick 的 Mac/u }));
    expect(await screen.findByRole("button", { name: "重新检测" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "智能体" }));
    fireEvent.click(await screen.findByRole("button", { name: /新建智能体/u }));
    fireEvent.click(await screen.findByRole("button", { name: /从空白开始/u }));
    const runtimeSelect = await screen.findByRole("combobox", { name: "Runtime" });
    fireEvent.click(runtimeSelect);
    expect(await screen.findByRole("option", { name: "Nick 的 Mac" })).toBeTruthy();
  });
});
