<div align="right"><a href="README.en.md">English</a></div>

# 示例

`examples/pi/` 是 `~/.pi/agent/` 的镜像。把它复制到用户目录后，`pi` 就能识别这些 agent 和 skill。

> 使用前先用 `pi install npm:subagent-isolation` 安装扩展。

## 目录结构

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

### 子 agent (`agents/`)

| Agent | 作用 | 工具 | Skill |
|-------|------|------|-------|
| `coder` | 写代码、改代码、跑验证 | `read, write, edit, bash, grep, find, ls` | `systematic-debugging` |
| `reviewer` | 只读评审，输出可操作的反馈 | `read, grep, find, ls` | _(无)_ |
| `writer` | 写文档、README、commit message、PR 描述 | `read, write, edit, grep, find, ls` | `writing-clearly-and-concisely` |

`coder`、`reviewer`、`writer` 都设置 `canDelegate: false`，作为“主 agent 规划、子 agent 执行”架构中的叶子执行者。

子 agent 通过 frontmatter 的 `skills:` 字段加载 skill。`coder` 用 `systematic-debugging` 先找根因再修复，`writer` 用 `writing-clearly-and-concisely` 打磨文字，`reviewer` 不带 skill，说明该字段可选。

### 主 agent (`master.md`)

`master.md` 是主 agent 的系统提示，负责理解需求、拆分任务并委派给子 agent。它通过 `--append-system-prompt` 加载，例如：

```bash
pi --append-system-prompt ~/.pi/agent/master.md --skill ~/.pi/agent/skills/brainstorming/
```

### 安装 agent

```bash
mkdir -p ~/.pi/agent/agents
cp examples/pi/agent/agents/*.md ~/.pi/agent/agents/
cp examples/pi/agent/master.md ~/.pi/agent/master.md
```

也可以放到项目级 `.pi/agents/` 目录，只对当前仓库生效。

## Skills (`skills/`)

| Skill | 使用者 | 说明 |
|-------|--------|------|
| [`brainstorming`](pi/agent/skills/brainstorming/SKILL.md) | 主 agent | 通过协作对话把想法变成完整设计 |
| [`systematic-debugging`](pi/agent/skills/systematic-debugging/SKILL.md) | `coder` | 修 bug 前先找根因（四阶段流程） |
| [`writing-clearly-and-concisely`](pi/agent/skills/writing-clearly-and-concisely/SKILL.md) | `writer` | 用简洁规则、AI 痕迹检测和人味注入打磨文字 |

安装：

```bash
mkdir -p ~/.pi/agent/skills
cp -r examples/pi/agent/skills/brainstorming ~/.pi/agent/skills/
cp -r examples/pi/agent/skills/systematic-debugging ~/.pi/agent/skills/
cp -r examples/pi/agent/skills/writing-clearly-and-concisely ~/.pi/agent/skills/
```

Skill 从 `~/.pi/agent/skills/`（用户级）或 `.pi/skills/`（项目级）加载。子 agent 在 frontmatter 中声明 `skills:` 后自动加载；主 agent 可在命令行用 `--skill` 加载：

```bash
pi --skill ~/.pi/agent/skills/brainstorming/
```

## 使用 `subagent` 调用

安装后，通过 `subagent` tool 调用：

```json
{
  "agent": "coder",
  "task": "把认证中间件重构为 async/await。"
}
```

```json
{
  "agent": "reviewer",
  "task": "评审 src/auth.ts 的改动是否正确、清晰。"
}
```

```json
{
  "agent": "writer",
  "task": "为认证中间件重构写一条简洁的 PR 描述。"
}
```
