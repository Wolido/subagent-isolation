<div align="right"><a href="ADVANCED.en.md">English</a></div>

# subagent-isolation 进阶参考

这里收录 `subagent-isolation` 的底层调用方式、配置字段和环境变量。普通用户按照主 README 的 Quick Start 用自然语言即可；只有当你需要手动构造 `subagent` 调用、复用隔离会话或调整运行参数时才需要查看本文档。

---

## Agent 定义格式

Agent 是 agents 目录中的 Markdown 文件（`.md`）。frontmatter 描述元数据，正文成为系统提示。

```markdown
---
name: coder
description: 编写整洁的 TypeScript 并处理重构。
tools: read, edit, write, bash
model: claude-3-7-sonnet
skills: /path/to/skill1,/path/to/skill2
canDelegate: false
---

你是一名资深 TypeScript 工程师。优先使用 async/await，避免回调。
```

## Frontmatter 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | **必填。** 工具调用时使用的唯一标识符。 |
| `description` | `string` | **必填。** 在 agent 列表和错误信息中显示的简短描述。 |
| `tools` | `string[]`（逗号分隔） | 可选的子 agent 工具白名单。 |
| `model` | `string` | 可选的模型覆盖，例如 `claude-3-7-sonnet`。 |
| `skills` | `string[]`（逗号分隔） | 可选的 skill 路径列表。若存在，则禁用全局 skills，仅加载列出的 skill。路径可绝对或相对于工作目录。 |
| `canDelegate` | `boolean` | 默认为 `true`。设为 `false` 可阻止该 agent 继续创建 subagent。 |

## 在主 agent 中调用

如果需要手动发起调用，JSON 格式如下：

```json
{
  "agent": "coder",
  "task": "将认证中间件重构为使用 async/await。"
}
```

## sessionId 复用

子 agent 完成后，返回结果末尾会附带 session ID：

```
<子 agent 的输出>

[subagent session: 01912345-6789-7abc-8def-0123456789ab]
```

下次继续同一任务时，传入 `sessionId` 即可复用隔离会话：

```json
{
  "agent": "coder",
  "task": "为重构后的认证中间件添加单元测试。",
  "sessionId": "01912345-6789-7abc-8def-0123456789ab"
}
```

> ⚠️ **并发提醒**：同一个 `sessionId` 不要同时用于多个并发的 `subagent` 调用，否则可能损坏 session 文件。请顺序复用，或确认子 agent 已完全退出。

## 环境变量

以下变量会自动传播到每个子 agent 进程：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PI_SUBAGENT_DEPTH` | `0` | 当前递归深度。每次嵌套调用自动递增，硬上限为 `2`。 |
| `PI_CAN_DELEGATE` | `true` | 当前 agent 是否允许委托，由 `canDelegate` 推导。 |
| `PI_CURRENT_AGENT_NAME` | — | 当前 agent 名称，注入每个子 agent 进程。 |
| `PI_SUBAGENT_ACTIVITY_TIMEOUT_MS` | `600000`（10 分钟） | stdout 空闲时的最大允许时间。 |
| `PI_SUBAGENT_HARD_TIMEOUT_MS` | `1800000`（30 分钟） | 单次 subagent 调用的绝对最大运行时长。 |

## 超时与终止

- 活动超时 10 分钟：子 agent stdout 长时间无输出会被终止。
- 硬超时 30 分钟：单次调用无论是否有输出，超过即终止。
- 收到 `AbortSignal` 时先发送 `SIGTERM`，5 秒后未退出则发送 `SIGKILL`。
