# Example agents for `subagent-isolation`

> Before using these example agents, install the extension with `pi install npm:subagent-isolation`.

This directory contains example agent definitions that demonstrate how to build isolated, single-purpose subagents on top of the `subagent-isolation` extension.

## Included agents

| Agent | Purpose | Tools |
|-------|---------|-------|
| `coder` | Implements code changes, refactors, and tests | `read, write, edit, bash, grep, find, ls` |
| `reviewer` | Reviews changes and produces actionable feedback | `read, grep, find, ls` (read-only) |
| `writer` | Writes documentation, READMEs, commit messages, PR descriptions | `read, write, edit, grep, find, ls` |

All three agents set `canDelegate: false`, so they act as leaf executors in a "main agent plans, subagent executes" architecture.

## Installation

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
