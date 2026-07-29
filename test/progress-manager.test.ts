import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { SubagentProgressManager, formatElapsed } from "../src/index.ts";

const WIDGET_KEY = "subagent-isolation-progress";

function createMockCtx(hasUI = true) {
	return {
		hasUI,
		ui: { setWidget: vi.fn() },
	} as any;
}

function createMockTheme() {
	return {
		fg: vi.fn((color: string, text: string) => text),
		bg: vi.fn((color: string, text: string) => text),
		bold: vi.fn((text: string) => text),
		italic: vi.fn((text: string) => text),
		underline: vi.fn((text: string) => text),
		inverse: vi.fn((text: string) => text),
		strikethrough: vi.fn((text: string) => text),
		getFgAnsi: vi.fn(() => ""),
		getBgAnsi: vi.fn(() => ""),
		getColorMode: vi.fn(() => "truecolor"),
		getThinkingBorderColor: vi.fn(() => (s: string) => s),
		getBashModeBorderColor: vi.fn(() => (s: string) => s),
	} as any;
}

function getLastFactory(setWidgetMock: ReturnType<typeof vi.fn>) {
	const calls = setWidgetMock.mock.calls.filter(
		([key, value]: [unknown, unknown]) => key === WIDGET_KEY && typeof value === "function",
	);
	expect(calls.length).toBeGreaterThan(0);
	return calls[calls.length - 1][1] as (tui: unknown, theme: unknown) => { render(width: number): string[]; invalidate(): void };
}

function renderLastWidget(setWidgetMock: ReturnType<typeof vi.fn>, theme: unknown, width = 80) {
	const factory = getLastFactory(setWidgetMock);
	const component = factory({}, theme);
	expect(typeof component.render).toBe("function");
	return component.render(width);
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
	let mockTheme: ReturnType<typeof createMockTheme>;

	beforeEach(() => {
		vi.useFakeTimers();
		mockTheme = createMockTheme();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should set a component factory widget on register and render horizontal separators", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();

		manager.register(ctx, "s1", "agent-a");

		expect(ctx.ui.setWidget).toHaveBeenCalledWith(WIDGET_KEY, expect.any(Function));
		const lines = renderLastWidget(ctx.ui.setWidget, mockTheme, 80);

		expect(lines.length).toBeGreaterThanOrEqual(3);
		expect(lines[0]).toContain("Subagents (1)");
		expect(lines[0]).not.toMatch(/[┌┐└┘│]/);
		expect(lines[lines.length - 1]).not.toMatch(/[┌┐└┘│]/);
		expect(lines[lines.length - 1].replace(/─/g, "")).toBe("");

		const dataLines = lines.slice(1, -1);
		expect(dataLines.length).toBe(1);
		expect(dataLines[0]).toContain("●");
		expect(dataLines[0]).toContain("agent-a");
		expect(dataLines[0]).toContain("00:00");

		manager.unregister("s1");
	});

	it("should update only in memory and render the new phase on the next tick", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "agent-a");
		ctx.ui.setWidget.mockClear();

		manager.update("s1", { phase: "thinking" });

		expect(ctx.ui.setWidget).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1000);

		expect(ctx.ui.setWidget).toHaveBeenCalledTimes(1);
		expect(ctx.ui.setWidget).toHaveBeenCalledWith(WIDGET_KEY, expect.any(Function));
		const lines = renderLastWidget(ctx.ui.setWidget, mockTheme, 80);
		const dataLines = lines.slice(1, -1);
		expect(dataLines[0]).toContain("thinking");

		manager.unregister("s1");
	});

	it("should stop the timer and clear the widget when the last agent unregisters", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "agent-a");
		manager.unregister("s1");

		expect((manager as any).timer).toBeNull();
		expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(WIDGET_KEY, undefined);
	});

	it("should share one timer across concurrent registrations and refresh on non-last unregister", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "agent-a");
		const timer = (manager as any).timer;

		manager.register(ctx, "s2", "agent-b");
		manager.register(ctx, "s3", "agent-c");

		expect((manager as any).timer).toBe(timer);

		ctx.ui.setWidget.mockClear();
		manager.unregister("s2");

		expect((manager as any).timer).toBe(timer);
		expect(ctx.ui.setWidget).toHaveBeenCalledWith(WIDGET_KEY, expect.any(Function));

		manager.unregister("s1");
		manager.unregister("s3");

		expect((manager as any).timer).toBeNull();
		expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(WIDGET_KEY, undefined);
	});

	it("should include a green dot, name, phase, elapsed, and recent tool summary on each agent row", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "agent-a");
		manager.update("s1", {
			phase: "tooling:bash",
			recentTools: ["bash ls -la", "read ~/file.md"],
		});

		vi.advanceTimersByTime(1000);

		const lines = renderLastWidget(ctx.ui.setWidget, mockTheme, 80);
		const dataLines = lines.slice(1, -1);

		expect(dataLines[0]).toContain("●");
		expect(mockTheme.fg).toHaveBeenCalledWith("success", "●");
		expect(dataLines[0]).toContain("agent-a");
		expect(dataLines[0]).toContain("bash");
		expect(dataLines[0]).toContain("00:01");
		expect(dataLines[0]).toContain("read ~/file.md");

		manager.unregister("s1");
	});

	it("should sort agents by startedAt and truncate earliest-started agents when over line budget", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		const originalRows = process.stdout.rows;
		process.stdout.rows = 4;

		try {
			const names: string[] = [];
			for (let i = 0; i < 6; i++) {
				names.push(`agent-${i}`);
				manager.register(ctx, `s${i}`, `agent-${i}`);
				vi.advanceTimersByTime(1);
			}

			const lines = renderLastWidget(ctx.ui.setWidget, mockTheme, 80);
			const dataLines = lines.slice(1, -1);

			expect(dataLines.length).toBeLessThanOrEqual(4);
			expect(dataLines[dataLines.length - 1]).toContain("agent-5");
			expect(lines.some((line) => line.includes("agent-0"))).toBe(false);
		} finally {
			process.stdout.rows = originalRows;
		}

		for (let i = 0; i < 6; i++) {
			manager.unregister(`s${i}`);
		}
	});

	it("should keep every rendered line within the requested width even with wide characters", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "🚀 火箭");
		manager.update("s1", {
			phase: "tooling:bash",
			recentTools: ["bash 你好世界.md"],
		});

		vi.advanceTimersByTime(1000);

		const lines = renderLastWidget(ctx.ui.setWidget, mockTheme, 40);

		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(40);
		}

		manager.unregister("s1");
	});

	it("should reflect the current agent count in the top label", () => {
		const manager = new SubagentProgressManager();
		const ctx = createMockCtx();
		manager.register(ctx, "s1", "agent-a");
		manager.register(ctx, "s2", "agent-b");

		vi.advanceTimersByTime(1000);

		const lines = renderLastWidget(ctx.ui.setWidget, mockTheme, 80);
		expect(lines[0]).toContain("Subagents (2)");

		manager.unregister("s1");
		manager.unregister("s2");
	});
});
