import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	isThinkingLevel,
	normalizeOverride,
	loadModelOverridesFile,
	loadModelOverrides,
} from "../src/index.ts";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

vi.mock("@earendil-works/pi-coding-agent", async () => {
	const actual = await vi.importActual("@earendil-works/pi-coding-agent");
	return {
		...actual,
		getAgentDir: vi.fn(),
	};
});

describe("isThinkingLevel", () => {
	it("should return true for off", () => {
		expect(isThinkingLevel("off")).toBe(true);
	});

	it("should return true for minimal", () => {
		expect(isThinkingLevel("minimal")).toBe(true);
	});

	it("should return true for low", () => {
		expect(isThinkingLevel("low")).toBe(true);
	});

	it("should return true for medium", () => {
		expect(isThinkingLevel("medium")).toBe(true);
	});

	it("should return true for high", () => {
		expect(isThinkingLevel("high")).toBe(true);
	});

	it("should return true for xhigh", () => {
		expect(isThinkingLevel("xhigh")).toBe(true);
	});

	it("should return true for max", () => {
		expect(isThinkingLevel("max")).toBe(true);
	});

	it("should return false for super", () => {
		expect(isThinkingLevel("super")).toBe(false);
	});

	it("should return false for empty string", () => {
		expect(isThinkingLevel("")).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isThinkingLevel(undefined as unknown as string)).toBe(false);
	});

	it("should return false for null", () => {
		expect(isThinkingLevel(null as unknown as string)).toBe(false);
	});

	it("should return false for number", () => {
		expect(isThinkingLevel(123 as unknown as string)).toBe(false);
	});

	it("should return false for extreme", () => {
		expect(isThinkingLevel("extreme")).toBe(false);
	});
});

describe("normalizeOverride", () => {
	it("should return model only when given a non-empty string", () => {
		const result = normalizeOverride("deepseek/deepseek-v4-pro");

		expect(result).toEqual({ model: "deepseek/deepseek-v4-pro" });
	});

	it("should return undefined when given an empty string", () => {
		const result = normalizeOverride("");

		expect(result).toBeUndefined();
	});

	it("should return model and thinking when given a valid object", () => {
		const result = normalizeOverride({
			model: "deepseek/deepseek-v4-pro",
			thinking: "high",
		});

		expect(result).toEqual({
			model: "deepseek/deepseek-v4-pro",
			thinking: "high",
		});
	});

	it("should return thinking only when object has no model", () => {
		const result = normalizeOverride({ thinking: "high" });

		expect(result).toEqual({ thinking: "high" });
	});

	it("should ignore invalid thinking level and keep model", () => {
		const result = normalizeOverride({ model: "xxx", thinking: "invalid" });

		expect(result).toEqual({ model: "xxx" });
	});

	it("should ignore empty model and keep thinking", () => {
		const result = normalizeOverride({ model: "", thinking: "high" });

		expect(result).toEqual({ thinking: "high" });
	});

	it("should return undefined when given an array", () => {
		const result = normalizeOverride(["a"]);

		expect(result).toBeUndefined();
	});

	it("should return undefined when given null", () => {
		const result = normalizeOverride(null);

		expect(result).toBeUndefined();
	});

	it("should return undefined when given a number", () => {
		const result = normalizeOverride(123);

		expect(result).toBeUndefined();
	});
});

describe("loadModelOverridesFile", () => {
	function writeTempFile(content: string): string {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-isolation-test-"));
		const filePath = path.join(tmpDir, "overrides.json");
		fs.writeFileSync(filePath, content, "utf-8");
		return filePath;
	}

	it("should parse old string format into model-only override", () => {
		const filePath = writeTempFile(JSON.stringify({ coder: "deepseek/deepseek-v4-pro" }));

		const result = loadModelOverridesFile(filePath);

		expect(result).toEqual({ coder: { model: "deepseek/deepseek-v4-pro" } });
	});

	it("should parse new object format with model and thinking", () => {
		const filePath = writeTempFile(
			JSON.stringify({ coder: { model: "m1", thinking: "high" } }),
		);

		const result = loadModelOverridesFile(filePath);

		expect(result).toEqual({ coder: { model: "m1", thinking: "high" } });
	});

	it("should parse mixed string and object formats", () => {
		const filePath = writeTempFile(
			JSON.stringify({
				coder: "m1",
				writer: { model: "m2", thinking: "low" },
			}),
		);

		const result = loadModelOverridesFile(filePath);

		expect(result).toEqual({
			coder: { model: "m1" },
			writer: { model: "m2", thinking: "low" },
		});
	});

	it("should return empty object when file does not exist", () => {
		const result = loadModelOverridesFile(path.join(os.tmpdir(), "does-not-exist.json"));

		expect(result).toEqual({});
	});

	it("should return empty object for empty JSON object", () => {
		const filePath = writeTempFile("{}");

		const result = loadModelOverridesFile(filePath);

		expect(result).toEqual({});
	});

	it("should ignore invalid values and return empty object", () => {
		const filePath = writeTempFile(JSON.stringify({ coder: 123 }));

		const result = loadModelOverridesFile(filePath);

		expect(result).toEqual({});
	});
});

describe("loadModelOverrides", () => {
	let tmpBase: string;
	let userAgentDir: string;
	let projectDir: string;

	beforeEach(() => {
		tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-isolation-test-"));
		userAgentDir = path.join(tmpBase, "user-agent");
		projectDir = path.join(tmpBase, "project");
		fs.mkdirSync(userAgentDir, { recursive: true });
		fs.mkdirSync(path.join(projectDir, ".pi"), { recursive: true });
		vi.mocked(getAgentDir).mockReturnValue(userAgentDir);
	});

	afterEach(() => {
		fs.rmSync(tmpBase, { recursive: true, force: true });
	});

	it("should return user overrides when only user-level config exists", () => {
		fs.writeFileSync(
			path.join(userAgentDir, "subagent-isolation.json"),
			JSON.stringify({ coder: { model: "user-model" } }),
		);

		const result = loadModelOverrides(projectDir);

		expect(result).toEqual({ coder: { model: "user-model" } });
	});

	it("should return project overrides when only project-level config exists", () => {
		fs.writeFileSync(
			path.join(projectDir, ".pi", "subagent-isolation.json"),
			JSON.stringify({ coder: { model: "project-model" } }),
		);

		const result = loadModelOverrides(projectDir);

		expect(result).toEqual({ coder: { model: "project-model" } });
	});

	it("should let project overrides replace user overrides for the same agent key", () => {
		fs.writeFileSync(
			path.join(userAgentDir, "subagent-isolation.json"),
			JSON.stringify({ coder: { model: "user-model", thinking: "low" } }),
		);
		fs.writeFileSync(
			path.join(projectDir, ".pi", "subagent-isolation.json"),
			JSON.stringify({ coder: { model: "project-model", thinking: "high" } }),
		);

		const result = loadModelOverrides(projectDir);

		expect(result).toEqual({ coder: { model: "project-model", thinking: "high" } });
	});

	it("should merge user and project overrides for different agent keys", () => {
		fs.writeFileSync(
			path.join(userAgentDir, "subagent-isolation.json"),
			JSON.stringify({ coder: { model: "user-model" } }),
		);
		fs.writeFileSync(
			path.join(projectDir, ".pi", "subagent-isolation.json"),
			JSON.stringify({ writer: { model: "project-model" } }),
		);

		const result = loadModelOverrides(projectDir);

		expect(result).toEqual({
			coder: { model: "user-model" },
			writer: { model: "project-model" },
		});
	});

	it("should return empty object when no config exists at either level", () => {
		const result = loadModelOverrides(projectDir);

		expect(result).toEqual({});
	});

	it("should find the nearest project-level config by walking up from cwd", () => {
		const nestedDir = path.join(projectDir, "packages", "app");
		fs.mkdirSync(nestedDir, { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, ".pi", "subagent-isolation.json"),
			JSON.stringify({ coder: { model: "project-model" } }),
		);

		const result = loadModelOverrides(nestedDir);

		expect(result).toEqual({ coder: { model: "project-model" } });
	});
});
