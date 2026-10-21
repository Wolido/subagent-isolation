/**
 * Regression tests for issue #4: under a Bun-compiled single-file `pi`
 * binary, `process.argv[1]` is the Bun virtual path `/$bunfs/root/pi`.
 * Bun's embedded virtual filesystem makes `fs.existsSync()` return true for
 * that path, so `getPiInvocation()` used to take the "argv[1] is a real
 * script" branch and prepend the virtual path to the child pi process args,
 * producing a bogus extra `user: /$bunfs/root/pi` turn in the subagent.
 *
 * Expected behavior locked here: when `process.execPath` is NOT a generic
 * runtime (basename is neither node/bun), the spawn command must be
 * `process.execPath` and its args must NOT be prefixed with `process.argv[1]`,
 * regardless of what `fs.existsSync(argv[1])` reports.
 *
 * Coverage spans all three branches of `getPiInvocation`: (a) non-generic
 * runtime, which re-invokes `process.execPath` without any argv[1] prefix;
 * (b) generic runtime with a resolvable real script, which re-invokes that
 * script; and (c) generic runtime whose argv[1] cannot be resolved, which
 * falls back to the bare `pi` command.
 *
 * `getPiInvocation` is module-private, so the behavior is locked through the
 * public extension entry point: the `subagent` tool registered by the default
 * export, with `node:child_process.spawn` mocked so the invocation can be
 * captured without launching a real pi process.
 *
 * `node:fs` is partially mocked: only `existsSync` is overridden, and only for
 * paths under Bun's virtual FS prefix; every other fs API is the real one.
 *
 * The Windows `node.exe` / `bun.exe` variants of the runtime regex are covered
 * with POSIX-style execPaths whose basename ends in `.exe` (e.g.
 * `/usr/local/bin/bun.exe`), because `path.basename()` is platform-specific:
 * feeding a Windows backslash path (`C:\\bun\\bun.exe`) on POSIX makes
 * `path.basename()` return the whole string, which simulates no real Windows
 * runtime at all and would wrongly force production code to normalize
 * separators. The `.exe` branch is exactly "basename is node.exe/bun.exe".
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import extension from "../src/index.ts";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const BUN_VIRTUAL_FS_PREFIX = "/$bunfs";
const BUN_VIRTUAL_SCRIPT = "/$bunfs/root/pi";

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

// Partial mock: Bun's embedded virtual FS reports every `/$bunfs/...` path as
// existing, but does not touch the real filesystem. Everything else (including
// fs.promises.mkdtemp/writeFile used by writePromptToTempFile) passes through.
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: (target: Parameters<typeof fs.existsSync>[0]) =>
			typeof target === "string" && target.startsWith(BUN_VIRTUAL_FS_PREFIX)
				? true
				: actual.existsSync(target),
	};
});

const SESSION_ID = "test-session-id";
const ENV_KEYS = [
	"PI_SUBAGENT_DEPTH",
	"PI_SUBAGENT_HARD_TIMEOUT_MS",
	"PI_SUBAGENT_ACTIVITY_TIMEOUT_MS",
];
const TASK = "test task";

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

describe("getPiInvocation runtime detection (regression for issue #4)", () => {
	let tmpBase: string;
	let agentDir: string;
	let defaultCwd: string;
	let spawnCalls: SpawnCall[];
	let executeTool: ExecuteFn;
	let savedEnv: Record<string, string | undefined>;
	let savedExecPath: string;
	let savedArgv: string[];

	function writeProjectAgent(): void {
		fs.writeFileSync(
			path.join(defaultCwd, ".pi", "agents", "tester.md"),
			"---\nname: tester\ndescription: Test agent\n---\n",
			"utf-8",
		);
	}

	/**
	 * Override the runtime identity that `getPiInvocation` inspects.
	 * `argv1 === undefined` leaves `process.argv` with only argv[0].
	 */
	function stubRuntime(execPath: string, argv1: string | undefined): void {
		Object.defineProperty(process, "execPath", {
			value: execPath,
			writable: true,
			enumerable: true,
			configurable: true,
		});
		Object.defineProperty(process, "argv", {
			value: argv1 === undefined ? [savedArgv[0]] : [savedArgv[0], argv1],
			writable: true,
			enumerable: true,
			configurable: true,
		});
	}

	/** The `pi` CLI args produced by the extension before any prefixing decision. */
	function businessArgs(): string[] {
		return [
			"--mode",
			"json",
			"-p",
			"--session-id",
			SESSION_ID,
			"--session-dir",
			path.resolve(agentDir, "subagent-sessions", SESSION_ID),
			`Task: ${TASK}`,
		];
	}

	async function runSubagent() {
		return executeTool(
			"call-1",
			{
				agent: "tester",
				task: TASK,
				sessionId: SESSION_ID,
				agentScope: "project",
			},
			undefined,
			undefined,
			{ cwd: defaultCwd, hasUI: false },
		);
	}

	beforeEach(() => {
		tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-isolation-invocation-test-"));
		agentDir = path.join(tmpBase, "agent-dir");
		defaultCwd = path.join(tmpBase, "default-cwd");
		fs.mkdirSync(path.join(defaultCwd, ".pi", "agents"), { recursive: true });
		vi.mocked(getAgentDir).mockReturnValue(agentDir);

		spawnCalls = [];
		vi.mocked(spawn).mockImplementation(((command: string, args: string[], options: any) => {
			spawnCalls.push({ command, args, options });
			return createSuccessfulProc();
		}) as any);

		const pi = {
			registerTool: (tool: { execute: ExecuteFn }) => {
				executeTool = tool.execute;
			},
		};
		extension(pi as any);

		savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
		process.env.PI_SUBAGENT_DEPTH = "0";
		delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;
		delete process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS;

		savedExecPath = process.execPath;
		savedArgv = process.argv;
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			if (savedEnv[key] === undefined) delete process.env[key];
			else process.env[key] = savedEnv[key];
		}
		// Restore the runtime identity so other test files are unaffected.
		Object.defineProperty(process, "execPath", {
			value: savedExecPath,
			writable: true,
			enumerable: true,
			configurable: true,
		});
		Object.defineProperty(process, "argv", {
			value: savedArgv,
			writable: true,
			enumerable: true,
			configurable: true,
		});
		fs.rmSync(tmpBase, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	it("should not pass the Bun virtual argv[1] when a non-generic pi binary reports it as existing", async () => {
		writeProjectAgent();
		stubRuntime("/opt/pi/bin/pi", BUN_VIRTUAL_SCRIPT);

		await runSubagent();

		expect(spawnCalls).toHaveLength(1);
		const { command, args } = spawnCalls[0];
		// The compiled pi binary re-invokes itself; no script path is needed.
		expect(command).toBe("/opt/pi/bin/pi");
		expect(args).toEqual(businessArgs());
		expect(args).not.toContain(BUN_VIRTUAL_SCRIPT);
		expect(args.filter((arg) => arg.startsWith(BUN_VIRTUAL_FS_PREFIX))).toEqual([]);
		// The real business args must survive untouched (first arg is not a script).
		expect(args[0]).toBe("--mode");
		expect(flagValues(args, "--session-id")).toEqual([SESSION_ID]);
		expect(args).toContain(`Task: ${TASK}`);
	});

	it("should report the Bun virtual script path as existing under the mocked virtual FS", () => {
		// Credibility floor for every other test in this file: if this assertion
		// fails, the `existsSync` precondition of the regression above was never
		// exercised and the RED result would be a false green.
		expect(fs.existsSync(BUN_VIRTUAL_SCRIPT)).toBe(true);
		expect(fs.existsSync(`${BUN_VIRTUAL_FS_PREFIX}/root/other`)).toBe(true);
		// The mock is prefix-scoped, not a blanket `true`.
		expect(fs.existsSync(path.join(tmpBase, "does-not-exist"))).toBe(false);
		expect(fs.existsSync(path.join(defaultCwd, ".pi", "agents", "tester.md"))).toBe(false);
		expect(fs.existsSync(tmpBase)).toBe(true);
	});

	it("should prepend the script when a generic node runtime runs a real script", async () => {
		writeProjectAgent();
		const realScript = path.join(tmpBase, "fake-pi.js");
		fs.writeFileSync(realScript, "// fake pi entry point\n", "utf-8");
		stubRuntime("/usr/local/bin/node", realScript);

		await runSubagent();

		expect(spawnCalls).toHaveLength(1);
		const { command, args } = spawnCalls[0];
		expect(command).toBe("/usr/local/bin/node");
		expect(args).toEqual([realScript, ...businessArgs()]);
		expect(args[0]).toBe(realScript);
	});

	it("should prepend the script when a generic bun runtime runs a real script", async () => {
		writeProjectAgent();
		const realScript = path.join(tmpBase, "fake-pi.ts");
		fs.writeFileSync(realScript, "// fake pi entry point\n", "utf-8");
		stubRuntime("/opt/bun/bin/bun", realScript);

		await runSubagent();

		expect(spawnCalls).toHaveLength(1);
		const { command, args } = spawnCalls[0];
		expect(command).toBe("/opt/bun/bin/bun");
		expect(args).toEqual([realScript, ...businessArgs()]);
		expect(args[0]).toBe(realScript);
	});

	it("should prepend the script when a generic node.exe runtime runs a real script", async () => {
		writeProjectAgent();
		// POSIX path with an `.exe` basename: `path.basename()` is platform
		// specific, so this is what faithfully exercises the regex's `.exe`
		// branch on every OS (see the file header note).
		const realScript = path.join(tmpBase, "fake-pi-win.js");
		fs.writeFileSync(realScript, "// fake pi entry point\n", "utf-8");
		stubRuntime("/usr/local/bin/node.exe", realScript);

		await runSubagent();

		expect(spawnCalls).toHaveLength(1);
		const { command, args } = spawnCalls[0];
		expect(command).toBe("/usr/local/bin/node.exe");
		expect(args).toEqual([realScript, ...businessArgs()]);
		expect(args[0]).toBe(realScript);
	});

	it("should prepend the script when a generic bun.exe runtime runs a real script", async () => {
		writeProjectAgent();
		// POSIX path with an `.exe` basename: see the file header note.
		const realScript = path.join(tmpBase, "fake-pi-bunexe.ts");
		fs.writeFileSync(realScript, "// fake pi entry point\n", "utf-8");
		stubRuntime("/usr/local/bin/bun.exe", realScript);

		await runSubagent();

		expect(spawnCalls).toHaveLength(1);
		const { command, args } = spawnCalls[0];
		expect(command).toBe("/usr/local/bin/bun.exe");
		expect(args).toEqual([realScript, ...businessArgs()]);
		expect(args[0]).toBe(realScript);
	});

	it("should not prepend argv[1] when a non-generic runtime is given a nonexistent script path", async () => {
		writeProjectAgent();
		const missingScript = path.join(tmpBase, "missing-pi");
		stubRuntime("/opt/pi/bin/pi", missingScript);

		await runSubagent();

		expect(spawnCalls).toHaveLength(1);
		const { command, args } = spawnCalls[0];
		expect(command).toBe("/opt/pi/bin/pi");
		expect(args).toEqual(businessArgs());
		expect(args).not.toContain(missingScript);
		expect(args[0]).toBe("--mode");
	});

	it("should not prepend argv[1] when a non-generic runtime has no argv[1] at all", async () => {
		writeProjectAgent();
		stubRuntime("/opt/pi/bin/pi", undefined);

		await runSubagent();

		expect(spawnCalls).toHaveLength(1);
		const { command, args } = spawnCalls[0];
		expect(command).toBe("/opt/pi/bin/pi");
		expect(args).toEqual(businessArgs());
		expect(args[0]).toBe("--mode");
	});

	it("should fall back to the bare pi command when a generic runtime has no resolvable script", async () => {
		writeProjectAgent();
		stubRuntime("/usr/local/bin/node", path.join(tmpBase, "missing-pi"));

		await runSubagent();

		expect(spawnCalls).toHaveLength(1);
		const { command, args } = spawnCalls[0];
		// Third branch: generic runtime, but argv[1] is not a real script, so the
		// extension relies on `pi` being on PATH instead of re-invoking a script.
		expect(command).toBe("pi");
		expect(args).toEqual(businessArgs());
	});
});
