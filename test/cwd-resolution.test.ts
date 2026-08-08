/**
 * Characterization tests for issue #1 (refactor: unify duplicate
 * `cwd ?? defaultCwd` resolution in `runSingleAgent` into a single
 * `effectiveCwd` variable).
 *
 * `runSingleAgent` is module-private, so these tests lock the observable
 * behavior through the public extension entry point: the `subagent` tool
 * registered by the default export. The effective cwd affects exactly two
 * observable outputs of the spawned subagent process invocation:
 *
 *   1. Relative `skills` paths in agent frontmatter are resolved against
 *      `cwd ?? defaultCwd` and passed as `--skill <resolved>` CLI args.
 *   2. The spawned pi process is started with `cwd: cwd ?? defaultCwd`.
 *
 * The subprocess boundary (`node:child_process.spawn`) is mocked so we can
 * capture the CLI args and spawn options without launching a real pi process.
 * These tests must pass both before AND after the refactor.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import extension from "../src/index.ts";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

vi.mock("@earendil-works/pi-coding-agent", async () => {
	const actual = await vi.importActual("@earendil-works/pi-coding-agent");
	return {
		...actual,
		getAgentDir: vi.fn(),
	};
});

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

const SESSION_ID = "test-session-id";
const ENV_KEYS = [
	"PI_SUBAGENT_DEPTH",
	"PI_SUBAGENT_HARD_TIMEOUT_MS",
	"PI_SUBAGENT_ACTIVITY_TIMEOUT_MS",
];

interface SpawnCall {
	command: string;
	args: string[];
	options: { cwd?: string; env?: Record<string, string | undefined> };
}

type ExecuteFn = (
	toolCallId: string,
	params: Record<string, unknown>,
	signal: AbortSignal | undefined,
	onUpdate: unknown,
	ctx: unknown,
) => Promise<any>;

/** Collect every value that follows a CLI flag, e.g. all `--skill <path>` values. */
function flagValues(args: string[], flag: string): string[] {
	const values: string[] = [];
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === flag) values.push(args[i + 1]);
	}
	return values;
}

/**
 * A minimal fake ChildProcess: emit stdout "end" and "exit" 0 on the next
 * microtask (after runSingleAgent has attached its listeners), so the run
 * finalizes successfully with exit code 0.
 */
function createSuccessfulProc() {
	const proc = new EventEmitter() as any;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn();
	proc.exitCode = null;
	proc.signalCode = null;
	queueMicrotask(() => {
		proc.stdout.emit("end");
		proc.emit("exit", 0, null);
	});
	return proc;
}

describe("runSingleAgent cwd resolution (characterization for issue #1)", () => {
	let tmpBase: string;
	let agentDir: string;
	let defaultCwd: string;
	let explicitCwd: string;
	let spawnCalls: SpawnCall[];
	let executeTool: ExecuteFn;
	let savedEnv: Record<string, string | undefined>;

	function writeProjectAgent(skills: string[]): void {
		fs.writeFileSync(
			path.join(defaultCwd, ".pi", "agents", "tester.md"),
			`---\nname: tester\ndescription: Test agent\nskills: ${skills.join(", ")}\n---\n`,
			"utf-8",
		);
	}

	async function runSubagent(cwd?: string) {
		const params: Record<string, unknown> = {
			agent: "tester",
			task: "test task",
			sessionId: SESSION_ID,
		};
		if (cwd !== undefined) params.cwd = cwd;
		// ctx.cwd is what the tool passes to runSingleAgent as `defaultCwd`;
		// params.cwd becomes the optional `cwd` argument.
		return executeTool("call-1", params, undefined, undefined, {
			cwd: defaultCwd,
			hasUI: false,
		});
	}

	beforeEach(() => {
		tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-isolation-cwd-test-"));
		agentDir = path.join(tmpBase, "agent-dir");
		defaultCwd = path.join(tmpBase, "default-cwd");
		explicitCwd = path.join(tmpBase, "explicit-cwd");
		fs.mkdirSync(path.join(defaultCwd, ".pi", "agents"), { recursive: true });
		fs.mkdirSync(explicitCwd, { recursive: true });
		vi.mocked(getAgentDir).mockReturnValue(agentDir);

		spawnCalls = [];
		vi.mocked(spawn).mockImplementation(((command: string, args: string[], options: any) => {
			spawnCalls.push({ command, args, options });
			return createSuccessfulProc();
		}) as any);

		// Capture the tool registered by the extension entry point.
		const pi = {
			registerTool: (tool: { execute: ExecuteFn }) => {
				executeTool = tool.execute;
			},
		};
		extension(pi as any);

		// Pin delegation-depth / timeout env vars so results are deterministic
		// regardless of the environment the test suite runs in.
		savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
		process.env.PI_SUBAGENT_DEPTH = "0";
		delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;
		delete process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS;
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			if (savedEnv[key] === undefined) delete process.env[key];
			else process.env[key] = savedEnv[key];
		}
		fs.rmSync(tmpBase, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	it("should resolve relative skill paths and process cwd against the explicit cwd when cwd is provided", async () => {
		writeProjectAgent(["skills/helper", "skills/other"]);

		const result = await runSubagent(explicitCwd);

		expect(result.isError).toBeUndefined();
		expect(spawnCalls).toHaveLength(1);
		const { args, options } = spawnCalls[0];
		// Usage #2: the spawned process runs in the explicit cwd.
		expect(options.cwd).toBe(explicitCwd);
		// Usage #1: relative skill paths resolve against the same explicit cwd.
		expect(flagValues(args, "--skill")).toEqual([
			path.resolve(explicitCwd, "skills/helper"),
			path.resolve(explicitCwd, "skills/other"),
		]);
		// The session dir is derived from the session id under the agent dir,
		// independent of cwd.
		expect(flagValues(args, "--session-dir")).toEqual([
			path.resolve(agentDir, "subagent-sessions", SESSION_ID),
		]);
	});

	it("should fall back to defaultCwd for skill paths and process cwd when cwd is not provided", async () => {
		writeProjectAgent(["skills/helper", "skills/other"]);

		const result = await runSubagent(undefined);

		expect(result.isError).toBeUndefined();
		expect(spawnCalls).toHaveLength(1);
		const { args, options } = spawnCalls[0];
		expect(options.cwd).toBe(defaultCwd);
		expect(flagValues(args, "--skill")).toEqual([
			path.resolve(defaultCwd, "skills/helper"),
			path.resolve(defaultCwd, "skills/other"),
		]);
		expect(flagValues(args, "--session-dir")).toEqual([
			path.resolve(agentDir, "subagent-sessions", SESSION_ID),
		]);
	});

	it("should ignore a relative skill path that escapes the effective cwd and keep the in-bounds path", async () => {
		writeProjectAgent(["../outside", "skills/ok"]);

		const result = await runSubagent(explicitCwd);

		const { args } = spawnCalls[0];
		expect(flagValues(args, "--skill")).toEqual([path.resolve(explicitCwd, "skills/ok")]);
		expect(result.details.results[0].stderr).toContain(
			'skill path "../outside" resolves outside the agent base directory and was ignored',
		);
	});

	it("should leave absolute and home-relative skill paths unchanged regardless of the effective cwd", async () => {
		const absoluteSkill = path.join(tmpBase, "abs-skill");
		writeProjectAgent([absoluteSkill, "~/home-skill"]);

		await runSubagent(explicitCwd);

		const { args } = spawnCalls[0];
		expect(flagValues(args, "--skill")).toEqual([
			absoluteSkill,
			path.join(os.homedir(), "home-skill"),
		]);
	});
});
