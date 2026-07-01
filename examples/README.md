# Examples for `subagent-isolation`

> Before using these examples, install the extension with `pi install npm:subagent-isolation`.

This directory contains example agent definitions and skill files that demonstrate how to build isolated, single-purpose subagents on top of the `subagent-isolation` extension.

## Examples overview

### Agents (`agents/`)

| Agent | Purpose | Tools | Skill |
|-------|---------|-------|-------|
| `master` | Main agent system prompt for planning and delegation | _(read-only, delegates to subagents)_ | `brainstorming` |
| `coder` | Implements code changes, refactors, and tests | `read, write, edit, bash, grep, find, ls` | `systematic-debugging` |
| `reviewer` | Reviews changes and produces actionable feedback | `read, grep, find, ls` (read-only) | _(none)_ |
| `writer` | Writes documentation, READMEs, commit messages, PR descriptions | `read, write, edit, grep, find, ls` | `writing-clearly-and-concisely` |

All three agents set `canDelegate: false`, so they act as leaf executors in a "main agent plans, subagent executes" architecture.

Each agent can optionally load a skill (specified in the `skills:` frontmatter field). Skills give the agent specialized knowledge — for example, `coder` uses `systematic-debugging` to methodically find root causes, and `writer` uses `writing-clearly-and-concisely` to produce polished, human-sounding prose. `reviewer` intentionally uses no skill, showing that the field is optional.

### Skills (`skills/`)

| Skill | Used by | Description |
|-------|---------|-------------|
| [`brainstorming`](skills/brainstorming/SKILL.md) | Main agent | Turn ideas into fully formed designs through collaborative dialogue |
| [`systematic-debugging`](skills/systematic-debugging/SKILL.md) | `coder` | Find root cause before attempting any fix (4-phase process) |
| [`writing-clearly-and-concisely`](skills/writing-clearly-and-concisely/SKILL.md) | `writer` | Refine prose with clarity rules, AI-pattern detection, and voice injection |

These skills are copies of real-world skills. To use them:

```bash
mkdir -p ~/.pi/agent/skills
cp -r examples/skills/brainstorming ~/.pi/agent/skills/
cp -r examples/skills/systematic-debugging ~/.pi/agent/skills/
cp -r examples/skills/writing-clearly-and-concisely ~/.pi/agent/skills/
```

Skills are discovered from `~/.pi/agent/skills/` (user scope) or `.pi/skills/` (project scope). The `skills:` field in an agent's frontmatter tells pi which skills to load for that agent. The main agent can also load skills via the `--skill` flag:

```bash
pi --skill ~/.pi/agent/skills/brainstorming/
```

## Installing agents

Copy the agent files into your user agents directory so `pi` can discover them:

```bash
mkdir -p ~/.pi/agent/agents
cp examples/agents/*.md ~/.pi/agent/agents/
```

You can also place them in a project-local `.pi/agents/` directory if the agents should only be available for a specific repository.

## Usage

Once installed, invoke an agent through the `subagent` tool:

```json
{
  "agent": "coder",
  "task": "Refactor the auth middleware to use async/await."
}
```

```json
{
  "agent": "reviewer",
  "task": "Review the changes in src/auth.ts for correctness and clarity."
}
```

```json
{
  "agent": "writer",
  "task": "Write a concise PR description for the auth middleware refactor."
}
```
