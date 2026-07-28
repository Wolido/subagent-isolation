import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SubagentProgressManager, formatElapsed } from "../src/index.ts";

const WIDGET_KEY = "subagent-isolation-progress";

function createMockCtx(hasUI = true) {
	return {
		hasUI,
		ui: { setWidget: vi.fn() },
	} as any;
}

describe("formatElapsed", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("pads seconds on the left (5s -> 00:05)", () => {
		expect(formatElapsed(Date.now() - 5_000)).toBe("00:05");
	});

	it("formats minutes and seconds (65s -> 01:05)", () => {
		expect(formatElapsed(Date.now() - 65_000)).toBe("01:05");
	});

	it("clamps negative values to zero", () => {
		expect(formatElapsed(Date.now() + 5_000)).toBe("00:00");
	});
});

describe("SubagentProgressManager", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts the timer on register and renders the widget", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "agent-a");
		expect((manager as any).timer).not.toBeNull();
		expect(ctx.ui.setWidget).toHaveBeenCalledWith(WIDGET_KEY, expect.any(Array));
		manager.unregister("s1");
	});

	it("update only mutates memory and does not trigger a refresh", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "agent-a");
		ctx.ui.setWidget.mockClear();

		manager.update("s1", { phase: "thinking" });
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();

		// The next 1Hz tick renders the updated phase.
		vi.advanceTimersByTime(1000);
		expect(ctx.ui.setWidget).toHaveBeenCalledTimes(1);
		const lines = ctx.ui.setWidget.mock.calls[0][1] as string[];
		expect(lines[0]).toContain("thinking");
		manager.unregister("s1");
	});

	it("stops the timer and clears the widget when the last agent unregisters", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "agent-a");
		manager.unregister("s1");
		expect((manager as any).timer).toBeNull();
		expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(WIDGET_KEY, undefined);
	});

	it("creates only one timer for multiple concurrent registrations", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "agent-a");
		const timer = (manager as any).timer;
		manager.register(ctx, "s2", "agent-b");
		manager.register(ctx, "s3", "agent-c");
		expect((manager as any).timer).toBe(timer);

		// Unregistering a non-last agent keeps the timer alive and refreshes.
		ctx.ui.setWidget.mockClear();
		manager.unregister("s2");
		expect((manager as any).timer).toBe(timer);
		expect(ctx.ui.setWidget).toHaveBeenCalledWith(WIDGET_KEY, expect.any(Array));

		manager.unregister("s1");
		manager.unregister("s3");
		expect((manager as any).timer).toBeNull();
		expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(WIDGET_KEY, undefined);
	});
});
