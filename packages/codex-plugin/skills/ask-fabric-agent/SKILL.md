---
name: ask-fabric-agent
description: 在当前 Codex 对话中通过 Agent Fabric MCP 查找当前账号可访问的 Agent、发起标准 A2A 问答或读取延迟 Task。用户说“问某个 Agent”“列出可用 Agent”或明确调用 `$ask-fabric-agent` 时使用。
---

# 调用 Agent

1. 先调用 `list_agents`，或在目标明确时调用 `find_agent`；只能从返回的当前可访问 Agent 中选择，不得猜测隐藏目标。
2. 名称不唯一时请用户确认；Agent 不存在与无权访问都按 `agent-not-found` 处理，不泄露存在性。
3. 目标可用时调用 `ask_agent`，传入 `agent_id` 和用户原文；终态文本直接返回当前 Codex 对话。
4. `ask_agent` 返回未终态 Task 时保留 `taskId`，随后调用 `get_task`。
5. 离线、归档、未绑定 Runtime、撤权或失败时报告准确的有界状态；不得管理 Agent、成员、Runtime 或扩大权限。
