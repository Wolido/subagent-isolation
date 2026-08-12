/**
 * Tests for timeout behavior in runSubagent (src/index.ts)
 * 
 * These tests verify three bugs that need to be fixed:
 * 1. stderr data should reset activity timer
 * 2. Activity timer should start immediately after spawn
 * 3. Timeout kills should set structured stopReason
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

type ExecuteFn = (
	toolCallId: string,
	params: Record<string, unknown>,
	signal: AbortSignal | undefined,
	onUpdate: unknown,
	ctx: unknown,
) => Promise<any>;

/**
 * Create a fake ChildProcess that we can control externally
 */
function createControllableProc() {
	const proc = new EventEmitter() as any;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn((signal?: string) => {
		// Simulate process termination
		if (signal === "SIGKILL" || signal === "SIGTERM") {
			queueMicrotask(() => {
				proc.stdout.emit("end");
				proc.emit("exit", null, signal);
				proc.emit("close", null, signal);
			});
		}
		return true;
	});
	proc.exitCode = null;
	proc.signalCode = null;
	return proc;
}

/**
 * Create a successful proc that exits normally
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

describe("runSubagent timeout behavior", () => {
	let tmpBase: string;
	let agentDir: string;
	let defaultCwd: string;
	let executeTool: ExecuteFn;
	let savedEnv: Record<string, string | undefined>;
	let procRef: ReturnType<typeof createControllableProc> | null;

	beforeEach(() => {
		vi.useFakeTimers();
		
		tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-isolation-timeout-test-"));
		agentDir = path.join(tmpBase, "agent-dir");
		defaultCwd = path.join(tmpBase, "default-cwd");
		fs.mkdirSync(path.join(defaultCwd, ".pi", "agents"), { recursive: true });
		fs.mkdirSync(agentDir, { recursive: true });
		vi.mocked(getAgentDir).mockReturnValue(agentDir);

		// Write a test agent
		fs.writeFileSync(
			path.join(defaultCwd, ".pi", "agents", "tester.md"),
			`---\nname: tester\ndescription: Test agent\n---\n`,
			"utf-8",
		);

		procRef = null;
		vi.mocked(spawn).mockImplementation((() => {
			procRef = createControllableProc();
			return procRef;
		}) as any);

		const pi = {
			registerTool: (tool: { execute: ExecuteFn }) => {
				executeTool = tool.execute;
			},
		};
		extension(pi as any);

		savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
		process.env.PI_SUBAGENT_DEPTH = "0";
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			if (savedEnv[key] === undefined) delete process.env[key];
			else process.env[key] = savedEnv[key];
		}
		fs.rmSync(tmpBase, { recursive: true, force: true });
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	async function runSubagent() {
		return executeTool("call-1", {
			agent: "tester",
			task: "test task",
			sessionId: SESSION_ID,
		}, undefined, undefined, {
			cwd: defaultCwd,
			hasUI: false,
		});
	}

	describe("Bug #1: stderr should reset activity timer", () => {
		it("should not kill process when stderr data arrives before activity timeout", async () => {
			// Set a short activity timeout for testing
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();
			
			// Wait for spawn to be called
			await vi.advanceTimersByTimeAsync(0);
			expect(procRef).not.toBeNull();

			// Emit some stdout data to start activity
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Wait for most of the timeout period
			await vi.advanceTimersByTimeAsync(800);

			// Emit stderr data - this SHOULD reset the timer (but currently doesn't - Bug #1)
			procRef!.stderr.emit("data", Buffer.from("shell command output\n"));
			await vi.advanceTimersByTimeAsync(0);

			// Wait past the original timeout - process should NOT be killed
			// because stderr activity should have reset the timer
			await vi.advanceTimersByTimeAsync(500);

			// If Bug #1 exists: process will be killed (total time: 1300ms > 1000ms)
			// If Bug #1 is fixed: process will NOT be killed (timer reset at 800ms, so next timeout at 1800ms)
			expect(procRef!.kill).not.toHaveBeenCalled();

			// Clean up
			procRef!.stdout.emit("end");
			procRef!.emit("exit", 0, null);
			await resultPromise;
		});
	});

	describe("Bug #2: Activity timer should start after spawn", () => {
		it("should kill process if no activity after spawn within timeout", async () => {
			// Set a short activity timeout
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();
			
			// Wait for spawn to be called
			await vi.advanceTimersByTimeAsync(0);
			expect(procRef).not.toBeNull();

			// DON'T emit any stdout/stderr data - simulating a hung process
			// The activity timer should have started at spawn time
			
			// Wait for the full timeout period
			await vi.advanceTimersByTimeAsync(1000);

			// If Bug #2 exists: process will NOT be killed (timer never started)
			// If Bug #2 is fixed: process WILL be killed (timer started at spawn)
			expect(procRef!.kill).toHaveBeenCalledWith("SIGKILL");

			// Clean up
			await resultPromise;
		});

		it("should allow process to run if activity occurs before timeout", async () => {
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();
			await vi.advanceTimersByTimeAsync(0);

			// Emit activity before timeout
			await vi.advanceTimersByTimeAsync(500);
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Wait past original timeout but within reset timeout
			await vi.advanceTimersByTimeAsync(800);

			// Process should NOT be killed
			expect(procRef!.kill).not.toHaveBeenCalled();

			// Clean up
			procRef!.stdout.emit("end");
			procRef!.emit("exit", 0, null);
			await resultPromise;
		});
	});

	describe("Bug #3: Timeout kill should set structured stopReason", () => {
		it("should set stopReason to 'activity_timeout' when activity timeout triggers", async () => {
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();
			await vi.advanceTimersByTimeAsync(0);

			// Emit some initial activity
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Wait for timeout
			await vi.advanceTimersByTimeAsync(1000);

			// Let the process terminate
			await vi.advanceTimersByTimeAsync(100);

			const result = await resultPromise;

			// If Bug #3 exists: stopReason will be undefined
			// If Bug #3 is fixed: stopReason should be "activity_timeout"
			expect(result.details.results[0].stopReason).toBe("activity_timeout");
		});

		it("should set stopReason to 'hard_timeout' when hard timeout triggers", async () => {
			process.env.PI_SUBAGENT_HARD_TIMEOUT_MS = "2000";
			delete process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS;

			const resultPromise = runSubagent();
			await vi.advanceTimersByTimeAsync(0);

			// Emit activity to keep process alive (activity timeout disabled)
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Wait for hard timeout
			await vi.advanceTimersByTimeAsync(2000);
			await vi.advanceTimersByTimeAsync(100);

			const result = await resultPromise;

			// If Bug #3 exists: stopReason will be undefined
			// If Bug #3 is fixed: stopReason should be "hard_timeout"
			expect(result.details.results[0].stopReason).toBe("hard_timeout");
		});

		it("should include timeout info in stderr for debugging", async () => {
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();
			await vi.advanceTimersByTimeAsync(0);

			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(100);

			const result = await resultPromise;

			// Should have diagnostic message in stderr
			expect(result.details.results[0].stderr).toContain("activity timeout");
			// Should also have stopReason set (Bug #3 fix)
			expect(result.details.results[0].stopReason).toBe("activity_timeout");
		});
	});

	describe("Integration: Combined timeout scenarios", () => {
		it("should handle stderr activity preventing timeout and set correct stopReason on eventual timeout", async () => {
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();
			await vi.advanceTimersByTimeAsync(0);

			// Start with stdout activity
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Wait 800ms
			await vi.advanceTimersByTimeAsync(800);

			// Emit stderr - should reset timer (Bug #1)
			procRef!.stderr.emit("data", Buffer.from("working...\n"));
			await vi.advanceTimersByTimeAsync(0);

			// Wait 800ms more (total 1600ms, but timer reset at 800ms)
			await vi.advanceTimersByTimeAsync(800);

			// Should not be killed yet
			expect(procRef!.kill).not.toHaveBeenCalled();

			// Wait for timeout after last activity
			await vi.advanceTimersByTimeAsync(200);

			// Now should be killed
			expect(procRef!.kill).toHaveBeenCalledWith("SIGKILL");
			await vi.advanceTimersByTimeAsync(100);

			const result = await resultPromise;

			// Should have structured stopReason (Bug #3)
			expect(result.details.results[0].stopReason).toBe("activity_timeout");
		});
	});
});
