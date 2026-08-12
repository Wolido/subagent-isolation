/**
 * Tests for technical debt items in runSingleAgent (src/index.ts)
 *
 * These tests verify four race condition / boundary bugs:
 * 1. Abort grace period: activity timer can fire during abort grace period
 * 2. Post-exit grace period: activity timer can fire after process exit
 * 3. stopReason override: timeout stopReason overridden by buffer flush
 * 4. Race conditions: (a) abort+timeout, (b) activity+hard timeout
 *
 * Mock pattern: createControllableProc() returns a fake ChildProcess whose
 * kill() is a no-op (does NOT auto-exit). This lets us observe timer behavior
 * without the process exiting and resolving the promise prematurely.
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
 * Create a fake ChildProcess whose kill() is a no-op.
 * The process stays alive until manually terminated by the test.
 * This lets us observe timer behavior without the process exiting prematurely.
 */
function createControllableProc() {
	const proc = new EventEmitter() as any;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn(() => true); // no-op: does NOT auto-exit
	proc.exitCode = null;
	proc.signalCode = null;
	return proc;
}

describe("Technical debt: race conditions and boundary bugs", () => {
	let tmpBase: string;
	let agentDir: string;
	let defaultCwd: string;
	let executeTool: ExecuteFn;
	let savedEnv: Record<string, string | undefined>;
	let procRef: ReturnType<typeof createControllableProc> | null;

	beforeEach(() => {
		vi.useFakeTimers();

		tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-isolation-debt-test-"));
		agentDir = path.join(tmpBase, "agent-dir");
		defaultCwd = path.join(tmpBase, "default-cwd");
		fs.mkdirSync(path.join(defaultCwd, ".pi", "agents"), { recursive: true });
		fs.mkdirSync(agentDir, { recursive: true });
		vi.mocked(getAgentDir).mockReturnValue(agentDir);

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

	/** Run the subagent tool, optionally with an abort signal. */
	async function runSubagent(signal?: AbortSignal) {
		return executeTool(
			"call-1",
			{
				agent: "tester",
				task: "test task",
				sessionId: SESSION_ID,
			},
			signal,
			undefined,
			{
				cwd: defaultCwd,
				hasUI: false,
			},
		);
	}

	/** Helper: manually end the process so the result promise resolves. */
	function endProcess(exitCode = 0, signal: string | null = null) {
		procRef!.stdout.emit("end");
		procRef!.emit("exit", signal ? null : exitCode, signal);
		procRef!.emit("close", signal ? null : exitCode, signal);
	}

	// ----------------------------------------------------------------
	// Debt #1: abort grace period mislabeling
	//
	// When abort fires, killProc sends SIGTERM and starts a 5s sigkillTimer.
	// But activityTimer is NOT cleared. If the activity timer fires during
	// the grace period, it calls proc.kill("SIGKILL") and sets
	// stopReason = "activity_timeout" — wrong, the cause was abort.
	//
	// Since wasAborted=true causes runSingleAgent to throw, we can't observe
	// stopReason directly. Instead we test the observable side effect:
	// extra SIGKILL from the activity timer during the grace period.
	// ----------------------------------------------------------------

	describe("Debt #1: abort grace period mislabeling", () => {
		it("should not call SIGKILL from activity timer during abort grace period", async () => {
			// Activity timeout at 1000ms. Abort at T=100ms.
			// Grace period: T=100ms to T=5100ms (5s sigkillTimer).
			// Activity timer fires at T=1000ms — within grace period.
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const controller = new AbortController();
			const resultPromise = runSubagent(controller.signal);
			resultPromise.catch(() => {}); // prevent unhandled rejection

			await vi.advanceTimersByTimeAsync(0);
			expect(procRef).not.toBeNull();

			// Emit initial activity (arms the activity timer for 1000ms from T=0)
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Abort at T=100ms
			await vi.advanceTimersByTimeAsync(100);
			controller.abort();
			await vi.advanceTimersByTimeAsync(0);

			// SIGTERM should have been sent
			expect(procRef!.kill).toHaveBeenCalledWith("SIGTERM");

			// Advance past the activity timeout (T=1100ms, well within 5s grace)
			await vi.advanceTimersByTimeAsync(1000);

			// Bug: activity timer fires during grace period → proc.kill("SIGKILL") called
			// Expected: no SIGKILL from activity timer (timers should be cleared on abort)
			const sigkillCalls = procRef!.kill.mock.calls.filter(
				(call: any[]) => call[0] === "SIGKILL",
			);
			expect(sigkillCalls).toHaveLength(0);

			// Clean up
			endProcess(0, "SIGTERM");
			await vi.advanceTimersByTimeAsync(0);
		});

		it("should not have extra kill calls after abort", async () => {
			// Activity timeout at 2000ms. Abort at T=100ms.
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "2000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const controller = new AbortController();
			const resultPromise = runSubagent(controller.signal);
			resultPromise.catch(() => {}); // prevent unhandled rejection

			await vi.advanceTimersByTimeAsync(0);

			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Abort at T=100ms
			await vi.advanceTimersByTimeAsync(100);
			controller.abort();
			await vi.advanceTimersByTimeAsync(0);

			// Record kill calls immediately after abort (should be 1: SIGTERM)
			const callsAfterAbort = procRef!.kill.mock.calls.length;
			expect(callsAfterAbort).toBe(1); // SIGTERM

			// Advance well past the activity timeout
			await vi.advanceTimersByTimeAsync(3000);

			// Bug: activity timer fires → proc.kill("SIGKILL") adds extra call
			// Expected: no new kill calls after abort
			expect(procRef!.kill.mock.calls.length).toBe(callsAfterAbort);

			endProcess(0, "SIGTERM");
			await vi.advanceTimersByTimeAsync(0);
		});
	});

	// ----------------------------------------------------------------
	// Debt #2: post-exit grace period race
	//
	// After proc.on("exit"), stdout may not have ended yet. The exit handler
	// sets a 500ms postExitTimer but does NOT clear activityTimer. If the
	// activity timer fires during this window (after exit, before postExitTimer
	// or stdout end), it wrongly labels the exit as "activity_timeout" and
	// changes exitCode from 0 to 1.
	//
	// Critical timing: activity timeout must be < 500ms (the postExitTimer
	// duration) so it fires BEFORE postExitTimer resolves the promise.
	// Process exits at T=100ms → activity timer at T=300ms → postExitTimer at T=600ms.
	// ----------------------------------------------------------------

	describe("Debt #2: post-exit grace period race", () => {
		it("should not set activity_timeout when process has already exited", async () => {
			// Activity timeout at 300ms. Process exits at T=100ms.
			// Activity timer fires at T=300ms (after exit at 100ms, before postExitTimer at 600ms).
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "300";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();

			await vi.advanceTimersByTimeAsync(0);

			// Emit initial activity at T=0 (arms the activity timer for 300ms from T=0)
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Process exits normally at T=100ms (before activity timeout at T=300ms)
			await vi.advanceTimersByTimeAsync(100);
			procRef!.emit("exit", 0, null);
			await vi.advanceTimersByTimeAsync(0);
			// Note: stdout has NOT ended yet — simulating slow stdout close

			// Advance to T=400ms — past activity timeout (T=300ms) but before postExitTimer (T=600ms)
			// Bug: activity timer fires even though process already exited
			await vi.advanceTimersByTimeAsync(300);

			// End stdout to clean up
			procRef!.stdout.emit("end");
			procRef!.emit("close", 0, null);
			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;
			const r = result.details.results[0];

			// Bug: activity timer fires after exit → stopReason = "activity_timeout", exitCode = 1
			// Expected: exit code should remain 0, no activity_timeout
			expect(r.stopReason).not.toBe("activity_timeout");
			expect(r.exitCode).toBe(0);
		});

		it("should not call kill on an already-exited process", async () => {
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "300";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();

			await vi.advanceTimersByTimeAsync(0);

			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Exit at T=100ms
			await vi.advanceTimersByTimeAsync(100);
			procRef!.emit("exit", 0, null);
			await vi.advanceTimersByTimeAsync(0);

			// Advance past activity timeout
			await vi.advanceTimersByTimeAsync(300);

			// Bug: activity timer calls proc.kill("SIGKILL") on already-exited process
			// Expected: kill should never be called for a normally-exited process
			expect(procRef!.kill).not.toHaveBeenCalled();

			procRef!.stdout.emit("end");
			procRef!.emit("close", 0, null);
			await vi.advanceTimersByTimeAsync(0);
			await resultPromise;
		});
	});

	// ----------------------------------------------------------------
	// Debt #3: stopReason override guard
	//
	// finalize() flushes the remaining stdout buffer via processLineRaw().
	// processLineRaw does NOT have a `resolved` guard (unlike processLine).
	// If the buffer contains a message_end with stopReason, it will override
	// the timeout stopReason that was just set by the activity/hard timer.
	// ----------------------------------------------------------------

	describe("Debt #3: stopReason override guard", () => {
		it("should not override activity_timeout stopReason with buffered message_end", async () => {
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();

			await vi.advanceTimersByTimeAsync(0);

			// Emit activity to arm the timer
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Emit a COMPLETE message_end event WITHOUT trailing newline.
			// The buffer accumulates: everything up to the last \n is processed,
			// the remainder stays in the buffer. With no \n, the whole JSON stays buffered.
			procRef!.stdout.emit(
				"data",
				Buffer.from(
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "done" }],
							stopReason: "end_turn",
							usage: { input: 10, output: 5, totalTokens: 15 },
						},
					}),
				),
			);
			await vi.advanceTimersByTimeAsync(0);

			// Activity timeout fires → sets stopReason = "activity_timeout"
			// Then finalize flushes buffer → processLineRaw processes message_end
			// Bug: processLineRaw overrides stopReason from "activity_timeout" → "end_turn"
			await vi.advanceTimersByTimeAsync(1000);

			// End process to resolve promise
			endProcess();
			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;

			// Bug: stopReason is "end_turn" (overridden by buffer flush)
			// Expected: stopReason should remain "activity_timeout"
			expect(result.details.results[0].stopReason).toBe("activity_timeout");
		});

		it("should not override hard_timeout stopReason with buffered message_end", async () => {
			process.env.PI_SUBAGENT_HARD_TIMEOUT_MS = "2000";
			delete process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS;

			const resultPromise = runSubagent();

			await vi.advanceTimersByTimeAsync(0);

			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Buffer a message_end without newline
			procRef!.stdout.emit(
				"data",
				Buffer.from(
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "done" }],
							stopReason: "end_turn",
							usage: { input: 10, output: 5, totalTokens: 15 },
						},
					}),
				),
			);
			await vi.advanceTimersByTimeAsync(0);

			// Hard timeout fires
			await vi.advanceTimersByTimeAsync(2000);

			endProcess();
			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;

			// Bug: stopReason is "end_turn" (overridden by buffer flush)
			// Expected: stopReason should remain "hard_timeout"
			expect(result.details.results[0].stopReason).toBe("hard_timeout");
		});
	});

	// ----------------------------------------------------------------
	// Debt #4: race conditions
	// ----------------------------------------------------------------

	describe("Debt #4: race conditions", () => {
		it("(a) abort then activity timeout should not produce SIGKILL", async () => {
			// Activity timeout at 500ms, abort at 100ms
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "500";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const controller = new AbortController();
			const resultPromise = runSubagent(controller.signal);
			resultPromise.catch(() => {}); // prevent unhandled rejection

			await vi.advanceTimersByTimeAsync(0);

			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Abort at T=100ms (before activity timeout at T=500ms)
			await vi.advanceTimersByTimeAsync(100);
			controller.abort();
			await vi.advanceTimersByTimeAsync(0);

			// Verify abort sent SIGTERM
			expect(procRef!.kill).toHaveBeenCalledWith("SIGTERM");

			// Advance past the activity timeout
			// Bug: activity timer fires at T=500ms, calls SIGKILL
			// Expected: no SIGKILL from activity timer
			await vi.advanceTimersByTimeAsync(500);

			const sigkillCalls = procRef!.kill.mock.calls.filter(
				(call: any[]) => call[0] === "SIGKILL",
			);
			expect(sigkillCalls).toHaveLength(0);

			endProcess(0, "SIGTERM");
			await vi.advanceTimersByTimeAsync(0);
		});

		it("(b) when activity timeout fires first, hard timer should be cleared and not override stopReason", async () => {
			// Activity at 500ms, hard at 1000ms
			// When activity timer fires, finalize() clears the hard timer synchronously.
			// This test verifies that behavior: hard timer should not fire after activity timer resolves.
			// NOTE: This test PASSES on current code because finalize clears hardTimer.
			// It serves as a regression guard to ensure this ordering is maintained.
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "500";
			process.env.PI_SUBAGENT_HARD_TIMEOUT_MS = "1000";

			const resultPromise = runSubagent();

			await vi.advanceTimersByTimeAsync(0);

			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Activity timeout fires at T=500ms → sets stopReason="activity_timeout", calls finalize(1)
			await vi.advanceTimersByTimeAsync(500);

			// finalize() from activity timer clears hardTimer synchronously.
			// Advance past where hard timer WOULD have fired.
			await vi.advanceTimersByTimeAsync(500);

			endProcess();
			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;

			// stopReason should remain "activity_timeout" — hard timer was cleared by finalize.
			expect(result.details.results[0].stopReason).toBe("activity_timeout");
			// Hard timer should not have called kill
			const sigkillCalls = procRef!.kill.mock.calls.filter(
				(call: any[]) => call[0] === "SIGKILL",
			);
			expect(sigkillCalls).toHaveLength(1); // only from activity timer
		});

		it("(b) hard timeout fires first → stopReason should be hard_timeout", async () => {
			// Activity at 2000ms, hard at 1000ms
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "2000";
			process.env.PI_SUBAGENT_HARD_TIMEOUT_MS = "1000";

			const resultPromise = runSubagent();

			await vi.advanceTimersByTimeAsync(0);

			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Hard timeout fires at T=1000ms
			await vi.advanceTimersByTimeAsync(1000);

			// Activity timeout would fire at T=2000ms
			await vi.advanceTimersByTimeAsync(1000);

			endProcess();
			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;

			// Hard timeout fired first → stopReason should be "hard_timeout"
			// This passes even with the bug: hard timer fires first, sets stopReason,
			// and finalize resolves. Activity timer callback won't fire (already resolved).
			expect(result.details.results[0].stopReason).toBe("hard_timeout");
		});
	});

	// ----------------------------------------------------------------
	// Debt #5: pre-aborted spawn + short hard timeout
	//
	// When signal.aborted is already true at spawn time, killProc() runs
	// BEFORE setupHardTimer(). killProc() tries to clear hardTimer but it's
	// undefined (no-op). Then setupHardTimer() creates a NEW hardTimer
	// WITHOUT checking wasAborted. If hardMs < 5000 (SIGKILL grace), it
	// fires during abort grace → bogus SIGKILL + "hard_timeout" label.
	// ----------------------------------------------------------------

	describe("Debt #5: pre-aborted spawn + short hard timeout", () => {
		it("should not arm hard timer when signal is pre-aborted", async () => {
			// Hard timeout at 1000ms. Signal pre-aborted.
			// killProc() sends SIGTERM at T=0, creates sigkillTimer for T=5000ms.
			// Bug: setupHardTimer() creates hardTimer for T=1000ms (no wasAborted guard).
			// At T=1000ms, hard timer fires → proc.kill("SIGKILL") + stopReason="hard_timeout".
			// Expected: no hard timer armed, no SIGKILL before T=5000ms.
			process.env.PI_SUBAGENT_HARD_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS;

			const controller = new AbortController();
			controller.abort(); // Pre-abort before spawn

			const resultPromise = runSubagent(controller.signal);
			resultPromise.catch(() => {}); // Prevent unhandled rejection

			await vi.advanceTimersByTimeAsync(0);
			expect(procRef).not.toBeNull();

			// SIGTERM should have been sent by killProc()
			expect(procRef!.kill).toHaveBeenCalledWith("SIGTERM");

			// Record kill calls at T=999ms (just before hard timer would fire)
			await vi.advanceTimersByTimeAsync(999);
			const callsBeforeHardTimer = procRef!.kill.mock.calls.length;

			// Advance to T=1000ms (when hard timer would fire if armed)
			await vi.advanceTimersByTimeAsync(1);

			// Bug: hard timer fires → extra proc.kill("SIGKILL") call
			// Expected: no new kill calls (hard timer should not be armed)
			expect(procRef!.kill.mock.calls.length).toBe(callsBeforeHardTimer);

			// Clean up: advance to sigkillTimer (T=5000ms)
			await vi.advanceTimersByTimeAsync(4000);
			endProcess(0, "SIGTERM");
			await vi.advanceTimersByTimeAsync(0);
		});

		it("should not SIGKILL during abort grace when pre-aborted", async () => {
			// Verify that no SIGKILL is sent during the abort grace period.
			// Since wasAborted=true causes throw, stopReason is not observable
			// directly; absence of SIGKILL in kill calls is the indirect proxy.
			process.env.PI_SUBAGENT_HARD_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS;

			const controller = new AbortController();
			controller.abort();

			const resultPromise = runSubagent(controller.signal);
			resultPromise.catch(() => {});

			await vi.advanceTimersByTimeAsync(0);

			// Advance past hard timer timeout
			await vi.advanceTimersByTimeAsync(1500);

			// Bug: hard timer fires → proc.kill("SIGKILL") during abort grace
			// Expected: no SIGKILL call (hard timer should not be armed)
			const sawSIGKILL = procRef!.kill.mock.calls.some(
				(call: any[]) => call[0] === "SIGKILL",
			);
			expect(sawSIGKILL).toBe(false);

			// Clean up
			await vi.advanceTimersByTimeAsync(3500);
			endProcess(0, "SIGTERM");
			await vi.advanceTimersByTimeAsync(0);
		});
	});

	// ----------------------------------------------------------------
	// Debt #6: abort event clears hard timer
	//
	// When abort event fires (not pre-aborted), killProc() clears hardTimer.
	// But setupHardTimer() at L1207 runs AFTER killProc() and creates a NEW
	// hardTimer without checking wasAborted. Same bug as Debt #5 but via
	// the addEventListener path instead of pre-aborted check.
	// ----------------------------------------------------------------

	describe("Debt #6: abort event clears hard timer", () => {
		it("should not fire hard timer after abort event", async () => {
			// Hard timeout at 1000ms. Abort at T=100ms.
			// killProc() at T=100ms clears hardTimer (created at T=0).
			// Bug: setupHardTimer() at L1207 creates NEW hardTimer for T=1100ms.
			// At T=1100ms, hard timer fires → proc.kill("SIGKILL").
			// Expected: no hard timer armed after abort, no SIGKILL before T=5100ms.
			process.env.PI_SUBAGENT_HARD_TIMEOUT_MS = "1000";
			delete process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS;

			const controller = new AbortController();
			const resultPromise = runSubagent(controller.signal);
			resultPromise.catch(() => {});

			await vi.advanceTimersByTimeAsync(0);
			expect(procRef).not.toBeNull();

			// Abort at T=100ms
			await vi.advanceTimersByTimeAsync(100);
			controller.abort();
			await vi.advanceTimersByTimeAsync(0);

			// SIGTERM should have been sent
			expect(procRef!.kill).toHaveBeenCalledWith("SIGTERM");

			// Record kill calls at T=1099ms (just before new hard timer would fire)
			await vi.advanceTimersByTimeAsync(999);
			const callsBeforeHardTimer = procRef!.kill.mock.calls.length;

			// Advance to T=1100ms (when hard timer would fire if re-armed)
			await vi.advanceTimersByTimeAsync(1);

			// Bug: hard timer fires → extra proc.kill("SIGKILL") call
			// Expected: no new kill calls (hard timer should not be re-armed)
			expect(procRef!.kill.mock.calls.length).toBe(callsBeforeHardTimer);

			// Clean up
			await vi.advanceTimersByTimeAsync(4000);
			endProcess(0, "SIGTERM");
			await vi.advanceTimersByTimeAsync(0);
		});
	});

	// ----------------------------------------------------------------
	// Debt #7: coverage gaps — guards already exist
	//
	// These tests verify that existing guards prevent re-arming timers
	// in edge cases. The guards are at L1077 in resetActivityTimer():
	// - `wasAborted` guard: prevents activity timer after abort
	// - `exitCodeValue !== null` guard: prevents activity timer after exit
	//
	// These tests should PASS (green) because the guards exist.
	// They serve as regression guards to ensure the guards are not removed.
	// ----------------------------------------------------------------

	describe("Debt #7: coverage gaps — guards already exist", () => {
		it("should not re-arm activity timer when stderr data arrives after abort", async () => {
			// Activity timeout at 500ms. Abort at T=100ms.
			// killProc() sets wasAborted=true and clears activityTimer.
			// At T=200ms, stderr data arrives → resetActivityTimer() called.
			// Guard: `if (resolved || wasAborted || exitCodeValue !== null) return;`
			// Expected: activity timer NOT re-armed (wasAborted=true).
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "500";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const controller = new AbortController();
			const resultPromise = runSubagent(controller.signal);
			resultPromise.catch(() => {});

			await vi.advanceTimersByTimeAsync(0);

			// Emit initial activity to arm activity timer
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Abort at T=100ms
			await vi.advanceTimersByTimeAsync(100);
			controller.abort();
			await vi.advanceTimersByTimeAsync(0);

			// Emit stderr data at T=200ms (after abort, during grace period)
			await vi.advanceTimersByTimeAsync(100);
			procRef!.stderr.emit("data", Buffer.from("post-abort stderr\n"));
			await vi.advanceTimersByTimeAsync(0);

			// Advance past where activity timer WOULD have fired if re-armed
			// (T=200ms + 500ms = T=700ms)
			await vi.advanceTimersByTimeAsync(500);

			// Guard exists: activity timer NOT re-armed → no SIGKILL from activity timer
			const sigkillCalls = procRef!.kill.mock.calls.filter(
				(call: any[]) => call[0] === "SIGKILL",
			);
			expect(sigkillCalls).toHaveLength(0);

			// Clean up
			endProcess(0, "SIGTERM");
			await vi.advanceTimersByTimeAsync(0);
		});

		it("should not re-arm activity timer when stdout data arrives after exit", async () => {
			// Activity timeout at 500ms. Process exits at T=100ms.
			// Exit handler sets exitCodeValue=0 and clears activityTimer.
			// At T=150ms, stdout data arrives (tail packet) → resetActivityTimer() called.
			// Guard: `if (resolved || wasAborted || exitCodeValue !== null) return;`
			// Expected: activity timer NOT re-armed (exitCodeValue !== null).
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "500";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();

			await vi.advanceTimersByTimeAsync(0);

			// Emit initial activity to arm activity timer
			procRef!.stdout.emit("data", Buffer.from('{"type":"turn_start"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Process exits at T=100ms
			await vi.advanceTimersByTimeAsync(100);
			procRef!.emit("exit", 0, null);
			await vi.advanceTimersByTimeAsync(0);

			// Emit stdout tail data at T=150ms (after exit, during post-exit grace)
			await vi.advanceTimersByTimeAsync(50);
			procRef!.stdout.emit("data", Buffer.from('{"type":"message_end"}\n'));
			await vi.advanceTimersByTimeAsync(0);

			// Advance past where activity timer WOULD have fired if re-armed
			// (T=150ms + 500ms = T=650ms)
			await vi.advanceTimersByTimeAsync(500);

			// Guard exists: activity timer NOT re-armed → no SIGKILL from activity timer
			expect(procRef!.kill).not.toHaveBeenCalled();

			// Clean up
			procRef!.stdout.emit("end");
			procRef!.emit("close", 0, null);
			await vi.advanceTimersByTimeAsync(0);
			await resultPromise;
		});
	});

	// ----------------------------------------------------------------
	// Control tests: verify that normal (non-timeout) stopReason behavior works
	// These should PASS on current code — they ensure any fix doesn't break
	// the normal message_end stopReason update flow.
	// ----------------------------------------------------------------

	describe("Control: normal stopReason flow (should pass)", () => {
		it("should set stopReason from message_end in normal flow", async () => {
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "60000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();

			await vi.advanceTimersByTimeAsync(0);

			// Emit a complete turn with message_end (with trailing newline)
			procRef!.stdout.emit(
				"data",
				Buffer.from(
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "hello" }],
							stopReason: "end_turn",
							usage: { input: 10, output: 5, totalTokens: 15 },
						},
					}) + "\n",
				),
			);
			await vi.advanceTimersByTimeAsync(0);

			// Process exits normally
			endProcess(0);
			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;

			// Normal flow: stopReason from message_end should be preserved
			expect(result.details.results[0].stopReason).toBe("end_turn");
			expect(result.details.results[0].exitCode).toBe(0);
		});

		it("should update stopReason on each turn", async () => {
			process.env.PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = "60000";
			delete process.env.PI_SUBAGENT_HARD_TIMEOUT_MS;

			const resultPromise = runSubagent();

			await vi.advanceTimersByTimeAsync(0);

			// First turn: stopReason = "max_tokens"
			procRef!.stdout.emit(
				"data",
				Buffer.from(
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "first" }],
							stopReason: "max_tokens",
							usage: { input: 10, output: 5, totalTokens: 15 },
						},
					}) + "\n",
				),
			);
			await vi.advanceTimersByTimeAsync(0);

			// Second turn: stopReason = "end_turn" (should override)
			procRef!.stdout.emit(
				"data",
				Buffer.from(
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "second" }],
							stopReason: "end_turn",
							usage: { input: 20, output: 10, totalTokens: 30 },
						},
					}) + "\n",
				),
			);
			await vi.advanceTimersByTimeAsync(0);

			endProcess(0);
			await vi.advanceTimersByTimeAsync(0);

			const result = await resultPromise;

			// Last turn's stopReason should win
			expect(result.details.results[0].stopReason).toBe("end_turn");
			expect(result.details.results[0].exitCode).toBe(0);
		});
	});
});
