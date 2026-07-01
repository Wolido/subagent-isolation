<div align="right"><a href="README.en.md">English</a></div>

# subagent-isolation

<div align="center">

[![npm version](https://img.shields.io/npm/v/subagent-isolation)](https://www.npmjs.com/package/subagent-isolation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Wolido/subagent-isolation)](https://github.com/Wolido/subagent-isolation)

</div>

> 让主 agent 专心做决策，把脏活累活交给独立的子 agent。

你的主 agent 是否被代码细节淹没？一次重构任务里，它要读文件、改代码、跑测试、看报错……几十个工具调用后，上下文塞满琐碎痕迹，最初的目标反而变得模糊。

**subagent-isolation** 是 [Pi Agent](https://github.com/earendil-works/pi-coding-agent) 的扩展，它把具体执行委派给专门的子 agent，每个子 agent 都在独立的 `pi` 进程中运行，拥有自己干净的上下文和只加载所需 skill 的能力。

---

## 它解决了什么问题

| Before | After |
|--------|-------|
| 主 agent 同时做规划和执行，上下文被工具调用痕迹快速占满 | 主 agent 只负责规划和委派，上下文保持清爽 |
| 所有 skill 和工具都堆在主 agent 里，容易互相干扰 | 每个子 agent 只加载任务需要的 skill，能力精确隔离 |
| 复杂任务在主 agent 一个窗口里越滚越大，容易迷失目标 | 子 agent 在独立进程中执行，完成即释放，结构清晰 |
| 担心子任务无限递归、越权调用 | 最大递归深度 2，`canDelegate: false` 可彻底阻止继续委派 |

---

## 核心设计

```
┌─────────────────────────────────────┐
│           主 agent (规划者)          │
│  “把认证中间件重构为 async/await”     │
│            subagent tool            │
└──────────────┬──────────────────────┘
               │ 启动独立 pi 进程
               ▼
┌─────────────────────────────────────┐
│        coder 子 agent (执行者)       │
│  · 独立上下文窗口                    │
│  · 只加载 coder 需要的 tools/skills  │
│  · 通过 read / edit / bash 完成修改  │
│  · 返回结果，释放进程                │
└─────────────────────────────────────┘
```

1. **进程隔离**：每个子 agent 启动新的 `pi --mode json` 进程，系统提示写入临时文件并通过 `--append-system-prompt` 注入，互不污染。
2. **上下文隔离**：子 agent 看不到主 agent 的执行痕迹，只拿到你委派的那一句话任务。
3. **能力隔离**：通过 `tools` 和 `skills` 字段，给不同子 agent 配备不同的“工具箱”。
4. **递归可控**：默认最大递归深度为 2，必要时用 `canDelegate: false` 让子 agent 无法继续下发任务。

---

## 前置条件：安装 Pi Agent

subagent-isolation 是一个 Pi Package，需要先安装 Pi Agent。

本扩展需要 Node.js >= 20（与 `package.json` 中的 `engines.node` 一致）。

### 方式一：一键安装（推荐 Linux / macOS）

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

### 方式二：通过 npm 全局安装

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

安装完成后，你就可以在终端使用 `pi` 命令了。

---

## 30 秒快速开始

### 1. 安装扩展

```bash
pi install npm:subagent-isolation
```

### 2. 创建你的第一个子 agent

在 `~/.pi/agent/agents/coder.md` 写入：

```markdown
---
name: coder
description: 编写和修改代码，完成具体的开发任务。
tools: read, write, edit, bash, grep, find, ls
canDelegate: false
---

你是一名资深工程师。接到任务后：
1. 先定位相关代码；
2. 做最小化、聚焦的修改；
3. 运行相关测试或类型检查；
4. 总结改了什么，并输出 `[coder: done]`。
```

### 3. 在主 agent 中调用

```json
{
  "agent": "coder",
  "task": "将认证中间件重构为使用 async/await。"
}
```

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

---

## 示例 agents

GitHub 仓库的 [`examples/agents/`](https://github.com/Wolido/subagent-isolation/tree/main/examples/agents) 提供了三个可直接参考的 agent：

| Agent | 作用 | 可用工具 |
|-------|------|----------|
| [`coder`](https://github.com/Wolido/subagent-isolation/blob/main/examples/agents/coder.md) | 写代码、改代码、跑验证 | `read, write, edit, bash, grep, find, ls` |
| [`reviewer`](https://github.com/Wolido/subagent-isolation/blob/main/examples/agents/reviewer.md) | 只读评审，输出可操作的反馈 | `read, grep, find, ls` |
| [`writer`](https://github.com/Wolido/subagent-isolation/blob/main/examples/agents/writer.md) | 写文档、改 README、生成 commit message | `read, write, edit, grep, find, ls` |

把它们复制到 `~/.pi/agent/agents/`（用户级）或项目内的 `.pi/agents/`（项目级）即可使用。

如果你已经克隆了仓库，可以直接复制：

```bash
cp examples/agents/*.md ~/.pi/agent/agents/
```

也可以单独从 GitHub 下载（以 `coder` 为例）：

```bash
curl -fsSL https://raw.githubusercontent.com/Wolido/subagent-isolation/main/examples/agents/coder.md \
  -o ~/.pi/agent/agents/coder.md
```

> 这些只是示例，你可以根据自己的需求修改或新建 agent。

Agent 搜索规则：

- `user` 作用域：`~/.pi/agent/agents/`
- `project` 作用域：`.pi/agents/`（从工作目录向上搜索）
- 默认合并两个作用域，project 同名时覆盖 user

---

## 主 agent 推荐配置

为了让主 agent 当好“规划者”，建议给它一个清晰的系统提示，例如：

```markdown
你是项目的主 agent。你的职责是理解用户需求并制定计划，
然后把具体执行委派给合适的子 agent。

可用子 agent：
- coder：写代码、重构、修 bug、加测试。
- reviewer：评审代码，输出 blocking issue 和建议。
- writer：写文档、README、commit message。

规则：
1. 不要自己直接编辑代码或跑命令。
2. 每次只委派一个清晰、具体的任务。
3. 收到结果后再决定下一步，不要一次性把所有任务塞给子 agent。
```

把示例 agent 复制到 `~/.pi/agent/agents/` 后，主 agent 启动时会自动发现它们。如果只想在当前项目生效，可以把 agent 放到 `.pi/agents/` 目录，并在启动时指定：

```bash
pi --agent-dir .pi/agents
```

---

## 架构与工作流程

```
用户提问
   │
   ▼
┌─────────────┐    任务拆分     ┌─────────────┐
│  主 agent    │ ─────────────▶ │ subagent    │
│  · 规划      │                │   tool      │
│  · 委派      │                └──────┬──────┘
│  · 汇总结果  │                       │
└─────────────┘                       │ 启动独立 pi 进程
                                      ▼
                            ┌───────────────────┐
                            │   子 agent 进程    │
                            │ · 干净上下文       │
                            │ · 指定 tools       │
                            │ · 指定 skills      │
                            │ · 执行并返回       │
                            └───────────────────┘
```

主 agent 只保留“要做什么”和“结果是什么”，中间的工具调用痕迹全部留在子 agent 的进程里。任务越复杂，这种隔离带来的收益越明显。

---

## 进阶配置

### Agent 定义格式

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

### Frontmatter 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | **必填。** 工具调用时使用的唯一标识符。 |
| `description` | `string` | **必填。** 在 agent 列表和错误信息中显示的简短描述。 |
| `tools` | `string[]`（逗号分隔） | 可选的子 agent 工具白名单。 |
| `model` | `string` | 可选的模型覆盖，例如 `claude-3-7-sonnet`。 |
| `skills` | `string[]`（逗号分隔） | 可选的 skill 路径列表。若存在，则禁用全局 skills，仅加载列出的 skill。路径可绝对或相对于工作目录。 |
| `canDelegate` | `boolean` | 默认为 `true`。设为 `false` 可阻止该 agent 继续创建 subagent。 |

### 环境变量

以下变量会自动传播到每个子 agent 进程：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PI_SUBAGENT_DEPTH` | `0` | 当前递归深度。每次嵌套调用自动递增，硬上限为 `2`。 |
| `PI_CAN_DELEGATE` | `true` | 当前 agent 是否允许委托，由 `canDelegate` 推导。 |
| `PI_CURRENT_AGENT_NAME` | — | 当前 agent 名称，注入每个子 agent 进程。 |
| `PI_SUBAGENT_ACTIVITY_TIMEOUT_MS` | `600000`（10 分钟） | stdout 空闲时的最大允许时间。 |
| `PI_SUBAGENT_HARD_TIMEOUT_MS` | `1800000`（30 分钟） | 单次 subagent 调用的绝对最大运行时长。 |

### 超时与终止

- 活动超时 10 分钟：子 agent stdout 长时间无输出会被终止。
- 硬超时 30 分钟：单次调用无论是否有输出，超过即终止。
- 收到 `AbortSignal` 时先发送 `SIGTERM`，5 秒后未退出则发送 `SIGKILL`。

---

## 项目结构

```
subagent-isolation/
├── src/
│   └── index.ts          # 扩展主源码
├── examples/agents/      # 示例 agent 定义
│   ├── coder.md
│   ├── reviewer.md
│   └── writer.md
├── package.json          # npm 包清单
├── tsconfig.json         # TypeScript 配置
├── README.md             # 中文说明（本文档）
├── README.en.md          # 英文说明
└── LICENSE               # MIT 许可证
```

---

## License

MIT
