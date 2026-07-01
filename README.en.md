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

| Role | Responsibility | Where it runs |
|------|----------------|---------------|
| Main agent | Understand requests, split tasks, delegate, and summarize | Your main `pi` session |
| Subagent | Read, edit, run checks, and return results | Isolated `pi --mode json` process |

A typical task flows like this:

1. You describe the task to the main agent.
2. The main agent uses the `subagent` tool to spawn an isolated `pi` process.
3. The subagent receives only the delegated task and its own config, then performs the work.
4. The subagent returns its result and exits; the main agent decides what’s next.

Isolation is guaranteed by:

- **Process isolation**: every subagent spawns a fresh `pi --mode json` process. Its system prompt is written to a temp file and injected via `--append-system-prompt`, so subagents never pollute each other.
- **Context isolation**: the subagent sees only the task you delegated, not the tool-call trail from the main agent.
- **Capability isolation**: the `tools` and `skills` fields give each subagent a precise, minimal toolbox.
- **Controlled recursion**: default max recursion depth is 2; set `canDelegate: false` to prevent a subagent from spawning further subagents.

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

### 3. Assign the task in natural language

Start `pi`, then tell the main agent:

> Refactor the auth middleware to use async/await.

The main agent will automatically call the `coder` subagent via the `subagent` tool. You don’t need to write JSON or worry about `sessionId` — the extension handles spawning and cleanup.

If you need to continue the same task, the subagent output ends with a session ID. See [ADVANCED.en.md](ADVANCED.en.md) for the exact format and reuse rules.

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

1. The user makes a request.
2. The main agent breaks it down and picks the right subagent.
3. The `subagent` tool spawns an isolated `pi` process for that subagent.
4. The subagent executes with a clean context and only the selected tools/skills.
5. The subagent returns its result and exits; the main agent summarizes and continues.

The main agent keeps only "what to do" and "what happened." All intermediate tool-call noise stays inside the subagent process. The more complex the task, the bigger the win.

---

## Advanced usage

If you need to construct `subagent` calls manually, reuse a `sessionId`, view the full frontmatter fields, or tune environment variables, see [ADVANCED.en.md](ADVANCED.en.md).

---

## Project structure

- `src/index.ts` — main extension source
- `examples/agents/` — example agent definitions
  - `coder.md`
  - `reviewer.md`
  - `writer.md`
- `package.json` — npm package manifest
- `tsconfig.json` — TypeScript configuration
- `README.md` / `README.en.md` — documentation
- `LICENSE` — MIT license

---

## License

MIT
