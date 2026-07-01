<div align="right"><a href="README.md">中文</a></div>

# Examples

`examples/pi/` mirrors `~/.pi/agent/`. Copy it to your user directory so `pi` can discover these agents and skills.

> Install the extension first with `pi install npm:subagent-isolation`.

## Directory structure

```
examples/pi/agent/
├── master.md
├── agents/
│   ├── coder.md
│   ├── reviewer.md
│   └── writer.md
└── skills/
    ├── brainstorming/
    ├── systematic-debugging/
    └── writing-clearly-and-concisely/
```

## Agents

### Subagents (`agents/`)

| Agent | Purpose | Tools | Skill |
|-------|---------|-------|-------|
| `coder` | Write, modify, and validate code | `read, write, edit, bash, grep, find, ls` | `systematic-debugging` |
| `reviewer` | Read-only review with actionable feedback | `read, grep, find, ls` | _(none)_ |
| `writer` | Write docs, READMEs, commit messages, PR descriptions | `read, write, edit, grep, find, ls` | `writing-clearly-and-concisely` |

`coder`, `reviewer`, and `writer` all set `canDelegate: false`. They act as leaf executors in a “main agent plans, subagents execute” architecture.

Subagents load skills via the `skills:` frontmatter field. `coder` uses `systematic-debugging` to find root causes before fixing, `writer` uses `writing-clearly-and-concisely` to refine prose, and `reviewer` uses no skill, showing that the field is optional.

### Main agent (`master.md`)

`master.md` is the main agent system prompt. It understands requests, splits tasks, and delegates to subagents. Load it with `--append-system-prompt`, for example:

```bash
pi --append-system-prompt ~/.pi/agent/master.md --skill ~/.pi/agent/skills/brainstorming/
```

### Install agents

```bash
mkdir -p ~/.pi/agent/agents
cp examples/pi/agent/agents/*.md ~/.pi/agent/agents/
cp examples/pi/agent/master.md ~/.pi/agent/master.md
```

You can also place them in a project-level `.pi/agents/` directory so they only apply to the current repository.

## Skills (`skills/`)

| Skill | Used by | Description |
|-------|---------|-------------|
| [`brainstorming`](pi/agent/skills/brainstorming/SKILL.md) | Main agent | Turn ideas into fully formed designs through collaborative dialogue |
| [`systematic-debugging`](pi/agent/skills/systematic-debugging/SKILL.md) | `coder` | Find root cause before attempting any fix (4-phase process) |
| [`writing-clearly-and-concisely`](pi/agent/skills/writing-clearly-and-concisely/SKILL.md) | `writer` | Refine prose with clarity rules, AI-pattern detection, and voice injection |

Install:

```bash
mkdir -p ~/.pi/agent/skills
cp -r examples/pi/agent/skills/brainstorming ~/.pi/agent/skills/
cp -r examples/pi/agent/skills/systematic-debugging ~/.pi/agent/skills/
cp -r examples/pi/agent/skills/writing-clearly-and-concisely ~/.pi/agent/skills/
```

Skills are discovered from `~/.pi/agent/skills/` (user scope) or `.pi/skills/` (project scope). Subagents auto-load skills declared in their frontmatter; the main agent can load one via `--skill`:

```bash
pi --skill ~/.pi/agent/skills/brainstorming/
```

## Calling subagents

Once installed, invoke a subagent through the `subagent` tool:

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
