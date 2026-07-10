/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports single mode: { agent: "name", task: "..." }
 *
 * Uses JSON mode to capture structured output from subagents.
 *
 * Modified: per-agent skill directory isolation via --no-skills --skill args.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	getMarkdownTheme,
	withFileMutationQueue,
	getAgentDir,
	parseFrontmatter,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ===== UUID v7 helper =====

/** Generate a UUID v7 (timestamp + random) without external dependencies. */
function uuidv7(): string {
	const timestamp = Date.now();
	const rand = crypto.randomBytes(10);
	const bytes = new Uint8Array(16);
	const view = new DataView(bytes.buffer);
	// high 16 bits of the 48-bit millisecond timestamp
	view.setUint16(0, Math.floor(timestamp / 0x100000000));
	// low 32 bits of the 48-bit millisecond timestamp
	view.setUint32(2, timestamp & 0xffffffff);
	// version = 7 (high nibble)
	bytes[6] = (rand[0] & 0x0f) | 0x70;
	bytes[7] = rand[1];
	// variant = 10xxxxxx
	bytes[8] = (rand[2] & 0x3f) | 0x80;
	bytes.set(rand.subarray(3), 9);

	let hex = "";
	for (const b of bytes) {
		hex += b.toString(16).padStart(2, "0");
	}
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ===== Inlined agents.ts with skills support =====

type AgentScope = "user" | "project" | "both";

/** Minimal model info for passing current model to subagents */
interface CurrentModel {
	provider: string;
	id: string;
}

interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	skills?: string[];
	canDelegate?: boolean;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

function parseListField(value: unknown): string[] | undefined {
	if (value === undefined || value === null) return undefined;
	if (Array.isArray(value)) {
		return (value as unknown[]).map(s => String(s).trim()).filter(Boolean);
	}
	if (typeof value === "string") {
		return value.split(",").map(s => s.trim()).filter(Boolean);
	}
	return undefined;
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];
	if (!fs.existsSync(dir)) return agents;
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}
	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;
		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);
		if (!frontmatter.name || !frontmatter.description) continue;
		const tools = parseListField(frontmatter.tools);
		const hasSkills = "skills" in frontmatter;
		const skills = hasSkills ? parseListField(frontmatter.skills) ?? [] : undefined;
		const canDelegate =
			frontmatter.canDelegate !== undefined
				? String(frontmatter.canDelegate).toLowerCase().trim() !== "false"
				: true;
		agents.push({
			name: frontmatter.name as string,
			description: frontmatter.description as string,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model as string | undefined,
			skills,
			canDelegate,
			systemPrompt: body,
			source,
			filePath,
		});
	}
	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "agents");
		if (isDirectory(candidate)) return candidate;
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);
	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents =
		scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");
	const agentMap = new Map<string, AgentConfig>();
	if (scope === "both") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}
	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

// ===== Original index.ts =====

const COLLAPSED_ITEM_COUNT = 10;

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function formatPhase(phase: string): string {
	if (phase === "thinking") return "🤔 thinking...";
	if (phase === "waiting") return "⏳ waiting for next step...";
	if (phase.startsWith("tooling:")) {
		const tool = phase.slice(8);
		return `⚡ ${tool}...`;
	}
	return "(running...)";
}

function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) {
		parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	}
	if (model) parts.push(model);
	return parts.join(" ");
}

function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: any, text: string) => string,
): string {
	const shortenPath = (p: string) => {
		const home = os.homedir();
		return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
	};

	switch (toolName) {
		case "bash": {
			const command = (args.command as string) || "...";
			const preview = command.length > 60 ? `${command.slice(0, 60)}...` : command;
			return themeFg("muted", "$ ") + themeFg("toolOutput", preview);
		}
		case "read": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let text = themeFg("accent", filePath);
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "";
				text += themeFg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
			}
			return themeFg("muted", "read ") + text;
		}
		case "write": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const content = (args.content || "") as string;
			const lines = content.split("\n").length;
			let text = themeFg("muted", "write ") + themeFg("accent", filePath);
			if (lines > 1) text += themeFg("dim", ` (${lines} lines)`);
			return text;
		}
		case "edit": {
			const rawPath = (args.file_path || args.path || "...") as string;
			return themeFg("muted", "edit ") + themeFg("accent", shortenPath(rawPath));
		}
		case "ls": {
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
		}
		case "find": {
			const pattern = (args.pattern || "*") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "find ") +
				themeFg("accent", pattern) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "grep ") +
				themeFg("accent", `/${pattern}/`) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		default: {
			let argsStr: string;
			try {
				argsStr = JSON.stringify(args);
			} catch {
				argsStr = "[unserializable]";
			}
			const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
			return themeFg("accent", toolName) + themeFg("dim", ` ${preview}`);
		}
	}
}

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface SingleResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
	phase: "idle" | "thinking" | `tooling:${string}` | "waiting";
	lastPhaseChange: number;
	thinkingBuffer?: string;
	sessionId: string;
}

interface SubagentDetails {
	mode: "single";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: SingleResult[];
}

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

type DisplayItem = { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, any> };

function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const msg of messages) {
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") items.push({ type: "text", text: part.text });
				else if (part.type === "toolCall")
					items.push({ type: "toolCall", name: part.name, args: part.arguments });
			}
		}
	}
	return items;
}

function formatSubagentDiagnostics(result: SingleResult, maxTraceItems = 15): string {
	const lines: string[] = [];
	lines.push(`Agent: ${result.agent} (${result.agentSource})`);
	lines.push(`Exit code: ${result.exitCode}`);
	if (result.stopReason) lines.push(`Stop reason: ${result.stopReason}`);
	if (result.errorMessage) lines.push(`Error message: ${result.errorMessage}`);

	const stderr = result.stderr.trim();
	if (stderr) {
		lines.push(`Stderr:\n${stderr.slice(0, 800)}${stderr.length > 800 ? "\n..." : ""}`);
	}

	const items = getDisplayItems(result.messages);
	if (items.length > 0) {
		lines.push("Execution trace:");
		const start = Math.max(0, items.length - maxTraceItems);
		if (start > 0) lines.push(`  ... ${start} earlier items omitted`);
		for (let i = start; i < items.length; i++) {
			const item = items[i];
			if (item.type === "text") {
				const text = item.text.trim();
				if (text) {
					const firstLine = text.split("\n")[0];
					const preview = firstLine.slice(0, 120);
					lines.push(`  [text] ${preview}${firstLine.length > 120 ? "..." : ""}`);
				}
			} else {
				let argsStr: string;
				try {
					argsStr = JSON.stringify(item.args);
				} catch {
					argsStr = "[unserializable]";
				}
				const preview = argsStr.slice(0, 100);
				lines.push(`  [tool] ${item.name}: ${preview}${argsStr.length > 100 ? "..." : ""}`);
			}
		}
	}

	const finalOutput = getFinalOutput(result.messages);
	if (finalOutput && finalOutput !== result.errorMessage) {
		lines.push(`Final output:\n${finalOutput.trim().slice(0, 500)}${finalOutput.length > 500 ? "\n..." : ""}`);
	}

	return lines.join("\n");
}

async function writePromptToTempFile(
	agentName: string,
	prompt: string,
): Promise<{ dir: string; filePath: string }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	});
	return { dir: tmpDir, filePath };
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

/**
 * Build the isolated session directory for a subagent.
 * All subagent sessions live under a dedicated root, independent of the main
 * agent's session directory and independent of cwd:
 *   ~/.pi/agent/subagent-sessions/<session-id>/
 */
function getSubagentSessionDir(sessionId: string): string {
	const root = path.resolve(path.join(getAgentDir(), "subagent-sessions"));
	const resolved = path.resolve(path.join(root, sessionId));
	const rel = path.relative(root, resolved);
	if (path.isAbsolute(rel) || rel === ".." || rel.startsWith(".." + path.sep) || resolved === root) {
		throw new Error(`Invalid sessionId: path traversal detected for "${sessionId}"`);
	}
	return resolved;
}

async function runSingleAgent(
	defaultCwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	cwd: string | undefined,
	step: number | undefined,
	sessionId: string | undefined,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	parentModel?: CurrentModel,
): Promise<SingleResult> {
	let effectiveSessionId: string;
	if (sessionId !== undefined) {
		const trimmed = sessionId.trim();
		const invalidSessionIdMessage =
			trimmed === ""
				? "Invalid sessionId: must not be empty"
				: trimmed === "." || trimmed === ".."
					? `Invalid sessionId: "${trimmed}" is not allowed`
					: !/^[A-Za-z0-9_.-]+$/.test(trimmed)
						? `Invalid sessionId: "${trimmed}" contains disallowed characters. Only letters, digits, underscore, dot, and hyphen are allowed.`
						: null;
		if (invalidSessionIdMessage) {
			return {
				agent: agentName,
				agentSource: "unknown",
				task,
				exitCode: 1,
				messages: [],
				stderr: invalidSessionIdMessage,
				errorMessage: invalidSessionIdMessage,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
				step,
				phase: "idle",
				lastPhaseChange: Date.now(),
				sessionId: trimmed,
			};
		}
		effectiveSessionId = trimmed;
	} else {
		effectiveSessionId = uuidv7();
	}
	const agent = agents.find((a) => a.name === agentName);

	if (!agent) {
		const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
			step,
			phase: "idle",
			lastPhaseChange: Date.now(),
			sessionId: effectiveSessionId,
		};
	}

	const args: string[] = ["--mode", "json", "-p", "--session-id", effectiveSessionId];
	if (agent.model) {
		// Explicit agent-level model config takes priority
		args.push("--model", agent.model);
	} else if (parentModel) {
		// Inherit the main agent's current model
		args.push("--model", `${parentModel.provider}/${parentModel.id}`);
	}
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	// MODIFIED: inject per-agent skill isolation
	const skillWarnings: string[] = [];
	if (agent.skills !== undefined) {
		args.push("--no-skills");
		if (agent.skills.length > 0) {
			const baseDir = cwd ?? defaultCwd;
			for (const skillPath of agent.skills) {
				const resolved = skillPath.startsWith("~/")
				    ? path.join(os.homedir(), skillPath.slice(2))
				    : path.isAbsolute(skillPath)
				        ? skillPath
				        : path.resolve(baseDir, skillPath);

				// Reject relative skill paths that escape baseDir
				if (!skillPath.startsWith("~/") && !path.isAbsolute(skillPath)) {
					const rel = path.relative(baseDir, resolved);
					if (rel === ".." || rel.startsWith(".." + path.sep)) {
						skillWarnings.push(
							`[subagent-isolation] skill path "${skillPath}" resolves outside the agent base directory and was ignored.\n`,
						);
						continue;
					}
				}

				args.push("--skill", resolved);
			}
		}
	}

	// Isolate subagent sessions under a dedicated root independent of cwd and
	// the main agent's session directory.
	const subagentSessionDir = getSubagentSessionDir(effectiveSessionId);
	args.push("--session-dir", subagentSessionDir);

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;

	const currentResult: SingleResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: skillWarnings.join(""),
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: agent.model || (parentModel ? `${parentModel.provider}/${parentModel.id}` : undefined),
		step,
		phase: "idle",
		lastPhaseChange: Date.now(),
		sessionId: effectiveSessionId,
	};

	const emitUpdate = () => {
		if (emitTimer) { clearTimeout(emitTimer); emitTimer = null; }
		if (onUpdate) {
			onUpdate({
				content: [{ type: "text", text: getFinalOutput(currentResult.messages) || formatPhase(currentResult.phase) }],
				details: makeDetails([currentResult]),
			});
		}
	};

	let emitTimer: ReturnType<typeof setTimeout> | null = null;
	const throttledEmitUpdate = () => {
		if (emitTimer) return;
		emitTimer = setTimeout(() => {
			emitTimer = null;
			emitUpdate();
		}, 100);
	};

	try {
		if (agent.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
			args.push("--append-system-prompt", tmpPromptPath);
		}

		args.push(`Task: ${task}`);
		let wasAborted = false;

		const POST_EXIT_GRACE_MS = 500;
		const ABORT_FORCE_TIMEOUT_MS = 2000;
		const DEFAULT_ACTIVITY_TIMEOUT_MS = 600_000;
		const DEFAULT_HARD_TIMEOUT_MS = 1_800_000;

		const parseEnvInt = (raw: string | undefined, fallback: number): number => {
			const parsed = parseInt(raw || String(fallback), 10);
			return Number.isNaN(parsed) ? fallback : parsed;
		};

		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const currentDepth = parseInt(process.env.PI_SUBAGENT_DEPTH || "0", 10);
			const proc = spawn(invocation.command, invocation.args, {
				cwd: cwd ?? defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					PI_SUBAGENT_DEPTH: String(currentDepth + 1),
					PI_CAN_DELEGATE: String(agent.canDelegate === true),
					PI_CURRENT_AGENT_NAME: agent.name,
				},
			});
			let buffer = "";
			let resolved = false;
			let exitCodeValue: number | null = null;
			let stdoutEnded = false;
			let postExitTimer: ReturnType<typeof setTimeout> | undefined;
			let sigkillTimer: ReturnType<typeof setTimeout> | undefined;
			let activityTimer: ReturnType<typeof setTimeout> | undefined;
			let hardTimer: ReturnType<typeof setTimeout> | undefined;
			let abortForceTimer: ReturnType<typeof setTimeout> | undefined;
			let killProc: (() => void) | undefined;

			const finalize = (code: number) => {
				if (resolved) return;
				resolved = true;
				if (postExitTimer) {
					clearTimeout(postExitTimer);
					postExitTimer = undefined;
				}
				if (sigkillTimer) {
					clearTimeout(sigkillTimer);
					sigkillTimer = undefined;
				}
				if (activityTimer) {
					clearTimeout(activityTimer);
					activityTimer = undefined;
				}
				if (hardTimer) {
					clearTimeout(hardTimer);
					hardTimer = undefined;
				}
				if (abortForceTimer) {
					clearTimeout(abortForceTimer);
					abortForceTimer = undefined;
				}
				if (emitTimer) {
					clearTimeout(emitTimer);
					emitTimer = null;
				}
				proc.stdout?.removeAllListeners();
				proc.stderr?.removeAllListeners();
				proc.removeAllListeners();
				if (signal && killProc) {
					signal.removeEventListener("abort", killProc);
				}
				if (buffer.trim()) processLineRaw(buffer);
				const effectiveCode =
					currentResult.stopReason === "error" || currentResult.errorMessage ? 1 : code;
				resolve(effectiveCode);
			};

			const maybeFinalizeAfterExit = () => {
				if (exitCodeValue !== null && stdoutEnded) {
					finalize(exitCodeValue);
				}
			};

			const processLineRaw = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				if (event.type === "turn_start") {
					currentResult.phase = "thinking";
					currentResult.lastPhaseChange = Date.now();
					currentResult.thinkingBuffer = "";
					resetActivityTimer();
					emitUpdate();
				}

				// message_start: assistant message begins; typically no text yet, so just update phase
				if (event.type === "message_start") {
					currentResult.phase = "thinking";
					currentResult.lastPhaseChange = Date.now();
					resetActivityTimer();
					emitUpdate();
				}

				if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
					const delta = event.assistantMessageEvent.delta as string;
					if (delta) {
						currentResult.thinkingBuffer = (currentResult.thinkingBuffer || "") + delta;
					}
					if (currentResult.thinkingBuffer && currentResult.thinkingBuffer.length > 2048) {
						// Keep last 2048 chars; try to keep whole lines if possible
						const idx = currentResult.thinkingBuffer.indexOf("\n", currentResult.thinkingBuffer.length - 2048);
						currentResult.thinkingBuffer = currentResult.thinkingBuffer.slice(idx >= 0 ? idx + 1 : -2048);
					}
					currentResult.phase = "thinking";
					currentResult.lastPhaseChange = Date.now();
					resetActivityTimer();
					throttledEmitUpdate();
				}

				if (event.type === "tool_execution_start") {
					currentResult.phase = `tooling:${event.toolName}`;
					currentResult.lastPhaseChange = Date.now();
					resetActivityTimer();
					emitUpdate();
				}

				if (event.type === "tool_execution_update") {
					currentResult.phase = `tooling:${event.toolName}`;
					resetActivityTimer();
					throttledEmitUpdate();
				}

				if (event.type === "tool_execution_end") {
					if (event.message) {
						currentResult.messages.push(event.message as Message);
					}
					currentResult.phase = "waiting";
					currentResult.lastPhaseChange = Date.now();
					resetActivityTimer();
					emitUpdate();
				}

				if (event.type === "turn_end") {
					currentResult.phase = "idle";
					currentResult.lastPhaseChange = Date.now();
					resetActivityTimer();
					emitUpdate();
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					currentResult.messages.push(msg);
					resetActivityTimer();

					if (msg.role === "assistant") {
						currentResult.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							currentResult.usage.input += usage.input || 0;
							currentResult.usage.output += usage.output || 0;
							currentResult.usage.cacheRead += usage.cacheRead || 0;
							currentResult.usage.cacheWrite += usage.cacheWrite || 0;
							currentResult.usage.cost += usage.cost?.total || 0;
							currentResult.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!currentResult.model && msg.model) currentResult.model = msg.model;
						if (msg.stopReason) currentResult.stopReason = msg.stopReason;
						if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;
						if (msg.stopReason === "error" || msg.errorMessage) {
							try {
								proc.kill("SIGKILL");
							} catch {
								/* ignore ESRCH */
							}
							emitUpdate();
							finalize(1);
							return;
						}
					}
					emitUpdate();
				}
			};
			const processLine = (line: string) => {
				if (resolved) return;
				processLineRaw(line);
			};

			const resetActivityTimer = () => {
				if (resolved) return;
				if (activityTimer) clearTimeout(activityTimer);
				const activityMs = parseEnvInt(
					process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS,
					DEFAULT_ACTIVITY_TIMEOUT_MS,
				);
				if (activityMs > 0) {
					activityTimer = setTimeout(() => {
						const elapsed = Date.now() - currentResult.lastPhaseChange;
						const phase = currentResult.phase;
						const turns = currentResult.usage.turns;
						currentResult.stderr += `[subagent-isolation] activity timeout exceeded after ${Math.round(elapsed / 1000)}s idle (phase: ${phase}, turns: ${turns}), killing...\n`;
						try {
							proc.kill("SIGKILL");
						} catch {
							/* ignore ESRCH */
						}
						finalize(1);
					}, activityMs);
				}
			};

			const setupHardTimer = () => {
				const hardMs = parseEnvInt(
					process.env.PI_SUBAGENT_HARD_TIMEOUT_MS,
					DEFAULT_HARD_TIMEOUT_MS,
				);
				if (hardMs > 0) {
					hardTimer = setTimeout(() => {
						const turns = currentResult.usage.turns;
						const phase = currentResult.phase;
						currentResult.stderr += `[subagent-isolation] hard timeout exceeded (phase: ${phase}, turns: ${turns}), killing...\n`;
						try {
							proc.kill("SIGKILL");
						} catch {
							/* ignore ESRCH */
						}
						finalize(1);
					}, hardMs);
				}
			};

			proc.stdout.on("data", (data) => {
				resetActivityTimer();
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stdout.on("end", () => {
				stdoutEnded = true;
				maybeFinalizeAfterExit();
			});

			proc.stderr.on("data", (data) => {
				currentResult.stderr += data.toString();
			});

			proc.on("exit", (code, signal) => {
				exitCodeValue = signal ? 1 : (code ?? 0);
				maybeFinalizeAfterExit();
				if (!resolved) {
					postExitTimer = setTimeout(() => finalize(exitCodeValue ?? 0), POST_EXIT_GRACE_MS);
				}
			});

			proc.on("close", (code, signal) => {
				finalize(signal ? 1 : (code ?? 0));
			});

			proc.on("error", (err) => {
				currentResult.stderr += `[subagent-isolation] process error: ${err?.message ?? String(err)}\n`;
				finalize(1);
			});

			if (signal) {
				killProc = () => {
					wasAborted = true;
					try {
						proc.kill("SIGTERM");
					} catch {
						/* ignore ESRCH */
					}
					if (exitCodeValue !== null || proc.exitCode !== null || proc.signalCode !== null) {
						finalize(1);
						return;
					}
					sigkillTimer = setTimeout(() => {
						try {
							if (proc.exitCode === null && proc.signalCode === null) {
								proc.kill("SIGKILL");
								abortForceTimer = setTimeout(() => {
									finalize(1);
								}, ABORT_FORCE_TIMEOUT_MS);
							}
						} catch {
							/* ignore ESRCH */
						}
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}

			setupHardTimer();
		});

		currentResult.exitCode = exitCode;
		if (wasAborted) throw new Error("Subagent was aborted");
		return currentResult;
	} finally {
		if (tmpPromptPath)
			try {
				fs.unlinkSync(tmpPromptPath);
			} catch {
				/* ignore */
			}
		if (tmpPromptDir)
			try {
				fs.rmdirSync(tmpPromptDir);
			} catch {
				/* ignore */
			}
	}
}

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: 'Which agent directories to use. Default: "both". Use "user" or "project" to limit scope.',
	default: "both",
});

const SubagentParams = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task to delegate. Must be non-empty and include background, input, requirements, output format, and acceptance criteria." }),
	sessionId: Type.Optional(Type.String({
		pattern: "^[A-Za-z0-9_.-]+$",
		description: "Optional session ID to reuse; a new UUID v7 is generated if omitted. Allowed characters: letters, digits, underscore, dot, and hyphen.",
	})),
	agentScope: Type.Optional(AgentScopeSchema),
	confirmProjectAgents: Type.Optional(
		Type.Boolean({ description: "Prompt before running project-local agents. Default: false.", default: false }),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate tasks to a specialized subagent with isolated context.",
			"Call with agent + task. The returned text ends with [subagent session: <id>] for reuse.",
			'Default agent scope is "both" at runtime (merges ~/.pi/agent/agents and .pi/agents).',
			'To restrict to only user or project agents, set agentScope: "user" or "project".',
		].join(" "),
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const currentDepth = parseInt(process.env.PI_SUBAGENT_DEPTH || "0", 10);
			const canDelegateEnv = process.env.PI_CAN_DELEGATE;
			const canDelegate = canDelegateEnv === "true";
			const MAX_SUBAGENT_DEPTH = 2;

			const globallyBlocked = currentDepth >= MAX_SUBAGENT_DEPTH;
			const locallyBlocked = currentDepth >= 1 && !canDelegate;

			if (globallyBlocked || locallyBlocked) {
				const reasons: string[] = [];
				if (globallyBlocked) {
					reasons.push(`global depth limit reached (max: ${MAX_SUBAGENT_DEPTH})`);
				}
				if (currentDepth >= 1 && !canDelegate) {
					const agentName = process.env.PI_CURRENT_AGENT_NAME || "current agent";
					reasons.push(`agent \`${agentName}\` has \`canDelegate: false\` in its frontmatter`);
				}
				return {
					content: [{
						type: "text",
						text: `Subagent delegation is blocked: ${reasons.join(", ")}.`,
					}],
					details: {
						mode: "single",
						agentScope: params.agentScope ?? "both",
						projectAgentsDir: null,
						results: [],
					} as SubagentDetails,
					isError: true,
				};
			}

			const agentName = params.agent;
			const task = typeof params.task === "string" ? params.task.trim() : "";

			if (!agentName) {
				return {
					content: [
						{
							type: "text",
							text: 'Missing required parameter: "agent". Please specify the name of the agent to invoke.',
						},
					],
					details: {
						mode: "single",
						agentScope: (params.agentScope ?? "both") as AgentScope,
						projectAgentsDir: null,
						results: [],
					} as SubagentDetails,
					isError: true,
				};
			}

			if (!task) {
				return {
					content: [
						{
							type: "text",
							text: 'Missing or empty required parameter: "task". The task must be non-empty and should include the five-section structure from master.md: 背景 (background), 输入 (input), 要求 (requirements), 输出格式 (output format), and 验收标准 (acceptance criteria).',
						},
					],
					details: {
						mode: "single",
						agentScope: (params.agentScope ?? "both") as AgentScope,
						projectAgentsDir: null,
						results: [],
					} as SubagentDetails,
					isError: true,
				};
			}

			const agentScope: AgentScope = params.agentScope ?? "both";
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = params.confirmProjectAgents ?? false;

			const makeDetails = (results: SingleResult[]): SubagentDetails => ({
				mode: "single",
				agentScope,
				projectAgentsDir: discovery.projectAgentsDir,
				results,
			});

			if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents && ctx.hasUI) {
				const projectAgent = agents.find((a) => a.name === params.agent && a.source === "project");

				if (projectAgent) {
					const dir = discovery.projectAgentsDir ?? "(unknown)";
					const ok = await ctx.ui.confirm(
						"Run project-local agents?",
						`Agents: ${projectAgent.name}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
					);
					if (!ok)
						return {
							content: [{ type: "text", text: "Canceled: project-local agents not approved." }],
							details: makeDetails([]),
						};
				}
			}

			const result = await runSingleAgent(
				ctx.cwd,
				agents,
				params.agent,
				task,
				params.cwd,
				undefined,
				params.sessionId,
				signal,
				onUpdate,
				makeDetails,
				ctx.model,
			);
			const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
			if (isError) {
				const diagnostics = formatSubagentDiagnostics(result) + `\n\n[subagent session: ${result.sessionId}]`;
				return {
					content: [{ type: "text", text: diagnostics }],
					details: makeDetails([result]),
					isError: true,
				};
			}
			const rawOutput = getFinalOutput(result.messages);
			const outputText = rawOutput
				? `${rawOutput}\n\n[subagent session: ${result.sessionId}]`
				: `[subagent session: ${result.sessionId}]`;
			return {
				content: [{ type: "text", text: outputText }],
				details: makeDetails([result]),
			};
		},

		renderCall(args, theme, _context) {
			const scope: AgentScope = args.agentScope ?? "both";
			const agentName = args.agent || "...";
			const preview = args.task ? (args.task.length > 60 ? `${args.task.slice(0, 60)}...` : args.task) : "...";
			let text =
				theme.fg("toolTitle", theme.bold("subagent ")) +
				theme.fg("accent", agentName) +
				theme.fg("muted", ` [${scope}]`);
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as SubagentDetails | undefined;
			if (!details || details.results.length === 0) {
				return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
			}

			const mdTheme = getMarkdownTheme();

			const renderDisplayItems = (items: DisplayItem[], limit?: number) => {
				const toShow = limit ? items.slice(-limit) : items;
				const skipped = limit && items.length > limit ? items.length - limit : 0;
				let text = "";
				if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier items\n`);
				for (const item of toShow) {
					if (item.type === "text") {
						const preview = expanded ? item.text : item.text.split("\n").slice(0, 3).join("\n");
						text += `${theme.fg("toolOutput", preview)}\n`;
					} else {
						text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
					}
				}
				return text.trimEnd();
			};

			if (details.mode === "single" && details.results.length === 1) {
				const r = details.results[0];
				const isError = r.exitCode !== 0 || r.stopReason === "error" || r.stopReason === "aborted";
				const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
				const displayItems = getDisplayItems(r.messages);
				const finalOutput = getFinalOutput(r.messages);

				if (expanded) {
					const container = new Container();
					let header = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
					if (isError && r.stopReason) header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
					if (r.phase !== "idle") header += ` ${theme.fg("warning", formatPhase(r.phase))}`;
					header += ` ${theme.fg("muted", `[session: ${r.sessionId}]`)}`;
					container.addChild(new Text(header, 0, 0));
					if (isError && r.errorMessage)
						container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
					if (r.thinkingBuffer) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("muted", "─── Thinking ───"), 0, 0));
						const lines = r.thinkingBuffer.trim().split("\n");
						const recent = lines.slice(-5).join("\n");
						container.addChild(new Text(theme.fg("dim", recent), 0, 0));
					}
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
					container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
					if (displayItems.length === 0 && !finalOutput) {
						container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
					} else {
						for (const item of displayItems) {
							if (item.type === "toolCall")
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
										0,
										0,
									),
								);
						}
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
						}
					}
					const usageStr = formatUsageStats(r.usage, r.model);
					if (usageStr) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
					}
					return container;
				}

				let text = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
				if (isError && r.stopReason) text += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
				if (r.phase !== "idle") text += ` ${theme.fg("warning", formatPhase(r.phase))}`;
				text += ` ${theme.fg("muted", `[session: ${r.sessionId}]`)}`;
				if (isError && r.errorMessage) text += `\n${theme.fg("error", `Error: ${r.errorMessage}`)}`;
				if (displayItems.length === 0) {
					if (!isError || !r.errorMessage) text += `\n${theme.fg("muted", "(no output)")}`;
				} else {
					text += `\n${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT)}`;
					if (displayItems.length > COLLAPSED_ITEM_COUNT) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				}
				const usageStr = formatUsageStats(r.usage, r.model);
				if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;
				return new Text(text, 0, 0);
			}

			return new Text(theme.fg("muted", "(no subagent result)"), 0, 0);
		}
	});
}
