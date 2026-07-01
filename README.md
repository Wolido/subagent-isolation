<div align="right"><a href="README.en.md">English</a></div>

# subagent-isolation

<div align="center">

[![npm version](https://img.shields.io/npm/v/subagent-isolation)](https://www.npmjs.com/package/subagent-isolation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

主 agent 不能碰代码。没有 `write`，没有 `edit`，没有 `bash`。它只有 `read`、`grep`、`find`、`ls` 四个只读工具，外加一个 `subagent` 工具用来委派任务。所有修改文件、跑命令、执行逻辑的工作，全部交给子 agent——每个子 agent 跑在独立的 `pi` 进程中，有自己的 system prompt 和 skills。主 agent 和子 agent 之间，子 agent 和子 agent 之间，进程完全隔离。

**subagent-isolation** 是 [Pi Agent](https://github.com/earendil-works/pi-coding-agent) 的扩展。Pi 本身已经支持子 agent，但这个扩展做了一个关键的约束——**剥夺主 agent 的执行能力，强制隔离**。主 agent 变成纯粹的计划者和观察者。

---

## 为什么需要这个

一个 agent 同时负责看代码、改文件、跑测试，工具调用痕迹会迅速塞满上下文。几轮 `read`、`edit`、`bash` 之后，agent 要处理的上下文里大半是工具输出的碎片——最初的任务描述被挤到角落，模型开始基于脏上下文做决策。

把这个过程拆开：

- **主 agent** 只做两件事：理解你要什么，把具体执行委派出去。它的上下文保持干净。
- **子 agent** 拿到一个明确的任务、一套精确的工具、干净的上下文。执行完就退出，不留痕迹。

上下文不再是一个不断膨胀的垃圾堆，而是一条清晰的流水线。

---

## Before / After

| Before | After |
|--------|-------|
| 主 agent 同时做规划和执行，工具调用痕迹挤满上下文 | 主 agent 只负责规划与委派，上下文保持清爽 |
| 所有 skill 和工具堆在主 agent 里，互相干扰 | 每个子 agent 只加载任务需要的 skill |
| 复杂任务在一个窗口里越滚越大，容易跑偏 | 子 agent 在独立进程中执行，完成即释放 |

---

## 核心设计

| 角色 | 职责 | 运行位置 |
|------|------|----------|
| 主 agent | 理解需求、拆分任务、委派与汇总 | 你的 `pi` 主会话 |
| 子 agent | 读代码、改代码、跑验证并返回结果 | 独立的 `pi --mode json` 进程 |

一个典型任务这样流转：

1. 你向主 agent 提出任务。
2. 主 agent 通过 `subagent` tool 启动一个独立 pi 进程。
3. 子 agent 只拿到委派的那一句话和自身配置，完成具体修改。
4. 子 agent 返回结果并退出，主 agent 决定下一步。

四个层面的隔离：

- **进程隔离**：每个子 agent 启动新的 `pi --mode json` 进程，system prompt 写入临时文件并通过 `--append-system-prompt` 注入，互不污染。
- **上下文隔离**：子 agent 看不到主 agent 的执行痕迹，只拿到你委派的那一句话。
- **能力隔离**：通过 `tools` 和 `skills` 字段，给不同子 agent 配备不同的工具箱。
- **递归边界**：子 agent 可配置为禁止继续向下委派，任务范围始终可控。

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

### 3. 用自然语言指派任务

```bash
pi
```

启动后，直接对主 agent 说：

> 把认证中间件重构为 async/await。

主 agent 会自动通过 `subagent` tool 调用 `coder`。你不需要手写 JSON，也不需要关心 `sessionId`——扩展会处理隔离进程的启动和回收。

如果你需要继续同一任务，子 agent 输出末尾会附带 session ID。具体调用格式与复用方式见 [ADVANCED.md](ADVANCED.md)。

---

## 示例 agents

GitHub 仓库的 [`examples/agents/`](https://github.com/Wolido/subagent-isolation/tree/main/examples/agents) 提供了三个可直接参考的 agent：

| Agent | 作用 | 可用工具 | 加载的 skill |
|-------|------|----------|-------------|
| [`coder`](https://github.com/Wolido/subagent-isolation/blob/main/examples/agents/coder.md) | 写代码、改代码、跑验证 | `read, write, edit, bash, grep, find, ls` | `systematic-debugging` |
| [`reviewer`](https://github.com/Wolido/subagent-isolation/blob/main/examples/agents/reviewer.md) | 只读评审，输出可操作的反馈 | `read, grep, find, ls` | _(无)_ |
| [`writer`](https://github.com/Wolido/subagent-isolation/blob/main/examples/agents/writer.md) | 写文档、改 README、生成 commit message | `read, write, edit, grep, find, ls` | `writing-clearly-and-concisely` |

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

为了让主 agent 当好"规划者"，建议给它一个清晰的系统提示，例如：

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

把示例 agent 复制到 `~/.pi/agent/agents/`：

```bash
cp examples/agents/*.md ~/.pi/agent/agents/
```

然后使用以下命令启动主 agent：

```bash
pi --tools read,grep,find,ls,subagent,todo,OpenAaaS --no-skills --append-system-prompt ~/.pi/agent/master.md --skill ~/.pi/agent/skills/brainstorming/
```

各参数含义：

- `--tools read,grep,find,ls,subagent,todo,OpenAaaS`：主 agent 只允许使用这些工具。`subagent` 用于委派任务，`todo` 用于任务管理，`OpenAaaS` 用于模型交互，`read/grep/find/ls` 用于查看仓库结构和已有 agent。
- `--no-skills`：不加载默认 skills，保持主 agent 上下文干净。
- `--append-system-prompt ~/.pi/agent/master.md`：把主 agent 的系统提示追加到默认提示后。
- `--skill ~/.pi/agent/skills/brainstorming/`：加载头脑风暴 skill（主 agent 用它做规划）。每个 agent 只加载任务需要的 skill，能力精确隔离。

子 agent（`coder`、`writer`）通过 frontmatter 中的 `skills:` 字段自动加载各自的 skill，无需在启动命令中指定。

如果只想在当前项目生效，把 agent 放到 `.pi/agents/` 目录即可；扩展会在调用 `subagent` 时自动加载这些项目级 agent。

---

## 架构与工作流程

1. 用户提出需求。
2. 主 agent 拆分任务，并决定委派给哪个子 agent。
3. `subagent` tool 为子 agent 启动独立的 pi 进程。
4. 子 agent 在干净上下文中执行，只使用指定的 tools/skills。
5. 子 agent 返回结果并退出，主 agent 汇总后继续。

主 agent 只保留"要做什么"和"结果是什么"，中间的工具调用痕迹全部留在子 agent 的进程里。任务越复杂，这种隔离带来的收益越明显。

---

## 示例 skills

GitHub 仓库的 [`examples/skills/`](https://github.com/Wolido/subagent-isolation/tree/main/examples/skills) 提供了三个可直接使用的 skill：

| Skill | 使用者 | 描述 |
|-------|--------|------|
| [`brainstorming`](https://github.com/Wolido/subagent-isolation/tree/main/examples/skills/brainstorming) | 主 agent | 通过协作对话把想法变成完整设计 |
| [`systematic-debugging`](https://github.com/Wolido/subagent-isolation/tree/main/examples/skills/systematic-debugging) | `coder` | 修 bug 前先找根因（四阶段流程） |
| [`writing-clearly-and-concisely`](https://github.com/Wolido/subagent-isolation/tree/main/examples/skills/writing-clearly-and-concisely) | `writer` | 用简洁规则、AI 痕迹检测和人味注入打磨文字 |

把这些 skill 复制到 `~/.pi/agent/skills/`：

```bash
mkdir -p ~/.pi/agent/skills
cp -r examples/skills/brainstorming ~/.pi/agent/skills/
cp -r examples/skills/systematic-debugging ~/.pi/agent/skills/
cp -r examples/skills/writing-clearly-and-concisely ~/.pi/agent/skills/
```

Skill 的加载方式有两种：

- **子 agent**：在 frontmatter 中用 `skills:` 字段声明（如 coder 的 `skills: systematic-debugging`），pi 启动子 agent 时自动加载。
- **主 agent**：在命令行用 `--skill` 标志加载（如 `--skill ~/.pi/agent/skills/brainstorming/`）。

Skill 搜索规则与 agent 相同：`~/.pi/agent/skills/`（用户级）和 `.pi/skills/`（项目级），子 agent 会根据 `skills:` 字段中的名称在这两个目录中查找匹配的 skill。

---

## 进阶用法

如果需要手写 `subagent` 调用、复用 `sessionId`、查看完整 frontmatter 字段或调整环境变量，请参阅 [ADVANCED.md](ADVANCED.md)。

---

## 项目结构

- `src/index.ts` — 扩展主源码
- `examples/agents/` — 示例 agent 定义
  - `coder.md`
  - `reviewer.md`
  - `writer.md`
- `examples/skills/` — 示例 skill 定义
  - `brainstorming/`
  - `systematic-debugging/`
  - `writing-clearly-and-concisely/`
- `package.json` — npm 包清单
- `tsconfig.json` — TypeScript 配置
- `README.md` / `README.en.md` — 说明文档
- `LICENSE` — MIT 许可证

---

## License

MIT
