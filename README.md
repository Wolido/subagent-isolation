<div align="right"><a href="README.en.md">English</a></div>

# subagent-isolation

> 一个 `pi` 扩展，它将任务委托给一个专门的 subagent，并在独立的 `pi` 进程中运行，让 subagent 拥有自己干净的上下文窗口。

## 功能特性

- **单次调用模式**
  - `single` — 使用 `{ agent: "name", task: "..." }` 调用一个 agent
- **Agent 发现与作用域**
  - `user` agent：来自 `~/.pi/agent/agents/`
  - `project` agent：来自 `.pi/agents/`（从工作目录向上搜索）
  - `both` — 合并两个作用域（project 同名时覆盖 user）
  - 运行仓库本地 agent 前，可选的 `confirmProjectAgents` 确认提示
  - 运行时 `agentScope` 默认为 `"both"`
- **进程隔离与递归深度控制**
  - 每个 subagent 都会启动一个全新的 `pi --mode json` 进程
  - 每个 subagent 的系统提示写入临时文件，并通过 `--append-system-prompt` 传入
  - 最大递归深度：`2`
  - 在 frontmatter 中设置 per-agent `canDelegate: false` 可阻止进一步委托
- **Skill 隔离**
  - 使用 `--no-skills` 可清空全局 skills
  - 通过 per-agent `skills` 列表，使用 `--skill <path>` 仅注入指定的 skills
- **超时与优雅终止**
  - 活动超时：10 分钟（stdout 空闲时终止）
  - 硬超时：30 分钟
  - `AbortSignal` 触发 `SIGTERM` → 5 秒后 `SIGKILL`
- **TUI 渲染**
  - 实时状态，可折叠输出（`Ctrl+O`）
  - Token 用量统计：input / output / cacheRead / cacheWrite / cost / model / turns

## 安装

本扩展以 [Pi Package](https://github.com/earendil-works/pi-coding-agent) 形式发布。直接在 `pi` 中安装：

```bash
pi install npm:subagent-isolation
```

这会使用 `pi` 的 npm 加载器，解析包的 `pi.extensions` 入口，并将核心导入映射到已安装的 `pi` 运行时包。无需手动克隆，也无需全局执行 `npm install`。

## 使用

通过 `subagent` 工具调用 agent，需要 `agent` 和 `task` 参数。

### 首次调用

```json
{
  "agent": "coder",
  "task": "将认证中间件重构为使用 async/await。",
  "cwd": "/optional/working/dir"
}
```

返回文本末尾会附加实际的 session ID：

```
<agent 输出>

[subagent session: 01912345-6789-7abc-8def-0123456789ab]
```

如果 agent 没有产生输出，结果就只是：

```
[subagent session: 01912345-6789-7abc-8def-0123456789ab]
```

### 复用 session

传入之前调用返回的 `sessionId`，即可继续同一个隔离 session：

```json
{
  "agent": "coder",
  "task": "为重构后的认证中间件添加单元测试。",
  "sessionId": "01912345-6789-7abc-8def-0123456789ab"
}
```

返回文本末尾仍然包含 `[subagent session: <id>]`，因此可以持续复用。

> ⚠️ **并发警告**：在多个并发的 `subagent` 调用中复用同一个 `sessionId` 可能会损坏 session 文件并导致状态交错。请仅将 session ID 用于顺序调用，或在复用前确保 subagent 进程已完全退出。

## Agent 定义格式

Agent 是 agents 目录中的 Markdown 文件（`.md`）。frontmatter 描述 agent 元数据，正文则成为系统提示。

```markdown
---
name: coder
description: 编写整洁的 TypeScript 并处理重构。
tools: read,edit,write,bash
model: claude-3-7-sonnet
skills: /path/to/skill1,/path/to/skill2
---

你是一名资深 TypeScript 工程师。优先使用 async/await，避免回调。
```

### Frontmatter 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | **必填。** 工具调用时使用的唯一标识符。 |
| `description` | `string` | **必填。** 在发现与错误信息中显示的简短描述。 |
| `tools` | `string[]`（逗号分隔） | 可选的 subagent 工具白名单。 |
| `model` | `string` | 可选的模型覆盖，例如 `claude-3-7-sonnet`。 |
| `skills` | `string[]`（逗号分隔） | 可选的 skill 路径列表。若存在，则禁用全局 skills，仅加载列出的 skill。路径可以是绝对路径，也可以相对于工作目录。 |
| `canDelegate` | `boolean` | 默认为 `true`。设为 `false` 可阻止该 agent 继续创建 subagent。 |

## 环境变量

以下变量控制运行时行为，它们会自动传播到每个 subagent 进程。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PI_SUBAGENT_DEPTH` | `0` | 当前递归深度。每次嵌套调用会自动递增。硬上限为 `2`。 |
| `PI_CAN_DELEGATE` | `true` | 当前 agent 是否允许委托。由 agent 的 `canDelegate` frontmatter 推导而来。 |
| `PI_CURRENT_AGENT_NAME` | — | 当前 agent 的名称，会注入到每个 subagent 进程。 |
| `PI_SUBAGENT_ACTIVITY_TIMEOUT_MS` | `600000`（10 分钟） | stdout 空闲时的最大允许时间，超过则终止 subagent。 |
| `PI_SUBAGENT_HARD_TIMEOUT_MS` | `1800000`（30 分钟） | 单次 subagent 调用的绝对最大运行时长。 |

## 项目结构

```
subagent-isolation/
├── src/
│   └── index.ts      # 扩展主源码
├── examples/
│   └── agents/       # 示例 agent 定义（coder、reviewer、writer）
├── package.json      # npm 包清单
├── tsconfig.json     # TypeScript 配置
├── README.md         # 中文说明（本文档）
├── README.en.md      # 英文说明
└── LICENSE           # MIT 许可证
```

`pi` 通过 `package.json` 顶层 `pi` 字段下的 `extensions` 数组加载本扩展。

## 许可证

MIT
