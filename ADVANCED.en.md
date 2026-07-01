<div align="right"><a href="ADVANCED.md">中文</a></div>

# subagent-isolation advanced reference

This document covers low-level invocation, configuration fields, and environment variables for `subagent-isolation`. Most users can follow the natural-language Quick Start in the main README; refer to this file only when you need to construct `subagent` calls manually, reuse an isolated session, or tune runtime parameters.

---

## Agent definition format

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

## Frontmatter fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | **Required.** Unique identifier used in tool calls. |
| `description` | `string` | **Required.** Short summary shown in discovery / error messages. |
| `tools` | `string[]` (comma-separated) | Optional tool whitelist for the subagent. |
| `model` | `string` | Optional model override, e.g. `claude-3-7-sonnet`. |
| `skills` | `string[]` (comma-separated) | Optional skill path list. If present, global skills are disabled and only these are loaded. Paths can be absolute or relative to the working directory. |
| `canDelegate` | `boolean` | Defaults to `true`. Set to `false` to prevent this agent from spawning further subagents. |

## Invoking from the main agent

To make a manual call, use JSON like this:

```json
{
  "agent": "coder",
  "task": "Refactor the auth middleware to use async/await."
}
```

## Reusing a sessionId

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

## Environment variables

These variables are propagated into every subagent process automatically:

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_SUBAGENT_DEPTH` | `0` | Current recursion depth. Auto-incremented per nested call. Hard cap is `2`. |
| `PI_CAN_DELEGATE` | `true` | Whether the current agent is allowed to delegate. Derived from `canDelegate`. |
| `PI_CURRENT_AGENT_NAME` | — | Name of the current agent, injected into every subagent process. |
| `PI_SUBAGENT_ACTIVITY_TIMEOUT_MS` | `600000` (10 min) | Max idle time on stdout before the subagent is killed. |
| `PI_SUBAGENT_HARD_TIMEOUT_MS` | `1800000` (30 min) | Absolute maximum runtime for a single subagent call. |

## Timeouts and termination

- Activity timeout: 10 minutes — subagent is killed if stdout is idle.
- Hard timeout: 30 minutes — single call is killed regardless of output.
- On `AbortSignal`, `SIGTERM` is sent; `SIGKILL` follows after 5 seconds if still running.
