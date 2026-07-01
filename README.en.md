<div align="right"><a href="README.md">中文</a></div>

# subagent-isolation

<div align="center">

[![npm version](https://img.shields.io/npm/v/subagent-isolation)](https://www.npmjs.com/package/subagent-isolation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Wolido/subagent-isolation)](https://github.com/Wolido/subagent-isolation)

</div>

> Let the main agent focus on decisions. Delegate the dirty work to isolated subagents.

Is your main agent drowning in implementation details? During a single refactor, it reads files, edits code, runs tests, parses errors... Dozens of tool calls later, the context window is stuffed with noise and the original goal is buried.

**subagent-isolation** is an extension for [Pi Agent](https://github.com/earendil-works/pi-coding-agent). It delegates concrete execution to specialized subagents, each running in its own isolated `pi` process with a clean context and only the skills it needs.

---

## The problem it solves

| Before | After |
|--------|-------|
| The main agent plans and executes, so tool-call noise quickly eats the context | The main agent only plans and delegates; its context stays clean |
| All skills and tools pile into the main agent and interfere with each other | Each subagent loads only the skills required for its task |
| Complex tasks snowball inside one window and lose focus | Subagents run in isolated processes, finish, and release resources |
| Worried about runaway recursion or overreach | Hard recursion limit of 2; `canDelegate: false` stops delegation cold |

---

## Core design

```
┌─────────────────────────────────────────────┐
│          Main agent (planner)               │
│  "Refactor the auth middleware to async/await"│
│              subagent tool                  │
└──────────────────┬──────────────────────────┘
                   │ spawn isolated pi process
                   ▼
┌─────────────────────────────────────────────┐
│          coder subagent (executor)          │
│  · isolated context window                  │
│  · only the tools/skills coder needs        │
│  · performs edits via read / edit / bash    │
│  · returns result, process exits            │
└─────────────────────────────────────────────┘
```

1. **Process isolation**: every subagent spawns a fresh `pi --mode json` process. Its system prompt is written to a temp file and injected via `--append-system-prompt`, so subagents never pollute each other.
2. **Context isolation**: the subagent sees only the task you delegated, not the tool-call trail from the main agent.
3. **Capability isolation**: the `tools` and `skills` fields give each subagent a precise, minimal toolbox.
4. **Controlled recursion**: default max recursion depth is 2; set `canDelegate: false` to prevent a subagent from spawning further subagents.

---

## Prerequisites: install Pi Agent

subagent-isolation is a Pi Package, so you need Pi Agent first.

This extension requires Node.js >= 20 (matching `engines.node` in `package.json`).

### Option 1: one-line install (recommended for Linux / macOS)

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

### Option 2: install via npm globally

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Once installed, the `pi` command is available in your terminal.

---

## 30-second quick start

### 1. Install the extension

```bash
pi install npm:subagent-isolation
```

### 2. Create your first subagent

Write this to `~/.pi/agent/agents/coder.md`:

```markdown
---
name: coder
description: Writes and edits code for concrete development tasks.
tools: read, write, edit, bash, grep, find, ls
canDelegate: false
---

You are a senior engineer. When you receive a task:
1. Locate the relevant code.
2. Make minimal, focused changes.
3. Run relevant tests or type checks.
4. Summarize what changed and end with `[coder: done]`.
```

### 3. Invoke it from the main agent

```json
{
  "agent": "coder",
  "task": "Refactor the auth middleware to use async/await."
}
```

When the subagent finishes, its output ends with a session ID:

```
<subagent output>

[subagent session: 01912345-6789-7abc-8def-0123456789ab]
```

To continue the same isolated session, pass the `sessionId`:

```json
{
  "agent": "coder",
  "task": "Add unit tests for the refactored auth middleware.",
  "sessionId": "01912345-6789-7abc-8def-0123456789ab"
}
```

> ⚠️ **Concurrency note**: reusing the same `sessionId` from multiple concurrent `subagent` calls can corrupt the session file. Use it sequentially, or make sure the subagent process has fully exited before reuse.

---

## Example agents

The GitHub repo ships three ready-to-reference agents in [`examples/agents/`](https://github.com/Wolido/subagent-isolation/tree/main/examples/agents):

| Agent | Purpose | Tools |
|-------|---------|-------|
| [`coder`](https://github.com/Wolido/subagent-isolation/blob/main/examples/agents/coder.md) | Write, modify, and validate code | `read, write, edit, bash, grep, find, ls` |
| [`reviewer`](https://github.com/Wolido/subagent-isolation/blob/main/examples/agents/reviewer.md) | Read-only review with actionable feedback | `read, grep, find, ls` |
| [`writer`](https://github.com/Wolido/subagent-isolation/blob/main/examples/agents/writer.md) | Write docs, READMEs, commit messages | `read, write, edit, grep, find, ls` |

Copy the `.md` files you need into `~/.pi/agent/agents/` (user-scoped) or `.pi/agents/` (project-scoped).

If you have already cloned the repo, copy them directly:

```bash
cp examples/agents/*.md ~/.pi/agent/agents/
```

Or download a single file from GitHub (using `coder` as an example):

```bash
curl -fsSL https://raw.githubusercontent.com/Wolido/subagent-isolation/main/examples/agents/coder.md \
  -o ~/.pi/agent/agents/coder.md
```

> These are examples only. Feel free to modify them or create your own.

Agent discovery rules:

- `user` scope: `~/.pi/agent/agents/`
- `project` scope: `.pi/agents/` (searched upward from the working directory)
- Default merges both scopes; project overrides user on name collisions

---

## Recommended main agent setup

To make the main agent a good planner, give it a clear system prompt such as:

```markdown
You are the main agent for this project. Your job is to understand user
requests, make a plan, and delegate concrete execution to the right subagent.

Available subagents:
- coder: writes code, refactors, fixes bugs, and adds tests.
- reviewer: reviews code and produces blocking issues and suggestions.
- writer: writes docs, READMEs, commit messages, and PR descriptions.

Rules:
1. Do not edit code or run commands yourself.
2. Delegate one clear, specific task at a time.
3. Wait for the result before deciding the next step.
```

After copying the example agents to `~/.pi/agent/agents/`, the main agent will discover them automatically. If you only want them for the current project, place them in `.pi/agents/` and point Pi at it:

```bash
pi --agent-dir .pi/agents
```

---

## Architecture and workflow

```
User request
    │
    ▼
┌─────────────┐    split tasks     ┌─────────────┐
│  Main agent  │ ────────────────▶ │  subagent   │
│  · plan      │                   │    tool     │
│  · delegate  │                   └──────┬──────┘
│  · summarize │                          │
└─────────────┘                           │ spawn isolated pi process
                                          ▼
                                ┌───────────────────┐
                                │  Subagent process  │
                                │ · clean context    │
                                │ · selected tools   │
                                │ · selected skills  │
                                │ · execute & return │
                                └───────────────────┘
```

The main agent keeps only "what to do" and "what happened." All intermediate tool-call noise stays inside the subagent process. The more complex the task, the bigger the win.

---

## Advanced configuration

### Agent definition format

Agents are Markdown files (`.md`) in an agents directory. Frontmatter describes metadata; the body becomes the system prompt.

```markdown
---
name: coder
description: Writes clean TypeScript and handles refactors.
tools: read, edit, write, bash
model: claude-3-7-sonnet
skills: /path/to/skill1,/path/to/skill2
canDelegate: false
---

You are a senior TypeScript engineer. Prefer async/await and avoid callbacks.
```

### Frontmatter fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | **Required.** Unique identifier used in tool calls. |
| `description` | `string` | **Required.** Short summary shown in discovery / error messages. |
| `tools` | `string[]` (comma-separated) | Optional tool whitelist for the subagent. |
| `model` | `string` | Optional model override, e.g. `claude-3-7-sonnet`. |
| `skills` | `string[]` (comma-separated) | Optional skill path list. If present, global skills are disabled and only these are loaded. Paths can be absolute or relative to the working directory. |
| `canDelegate` | `boolean` | Defaults to `true`. Set to `false` to prevent this agent from spawning further subagents. |

### Environment variables

These variables are propagated into every subagent process automatically:

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_SUBAGENT_DEPTH` | `0` | Current recursion depth. Auto-incremented per nested call. Hard cap is `2`. |
| `PI_CAN_DELEGATE` | `true` | Whether the current agent is allowed to delegate. Derived from `canDelegate`. |
| `PI_CURRENT_AGENT_NAME` | — | Name of the current agent, injected into every subagent process. |
| `PI_SUBAGENT_ACTIVITY_TIMEOUT_MS` | `600000` (10 min) | Max idle time on stdout before the subagent is killed. |
| `PI_SUBAGENT_HARD_TIMEOUT_MS` | `1800000` (30 min) | Absolute maximum runtime for a single subagent call. |

### Timeouts and termination

- Activity timeout: 10 minutes — subagent is killed if stdout is idle.
- Hard timeout: 30 minutes — single call is killed regardless of output.
- On `AbortSignal`, `SIGTERM` is sent; `SIGKILL` follows after 5 seconds if still running.

---

## Project structure

```
subagent-isolation/
├── src/
│   └── index.ts          # Main extension source
├── examples/agents/      # Example agent definitions
│   ├── coder.md
│   ├── reviewer.md
│   └── writer.md
├── package.json          # npm package manifest
├── tsconfig.json         # TypeScript configuration
├── README.md             # Chinese documentation
├── README.en.md          # English documentation (this file)
└── LICENSE               # MIT license
```

---

## License

MIT
