import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { claude } from "./claude";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

it("passes the chosen effort to Claude Code ahead of a local effort default", async () => {
  vi.stubEnv("CLAUDE_CODE_EFFORT_LEVEL", "low");
  const transcript = Object.assign(vi.fn(), { reportTokens: vi.fn() });
  try {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        const events = [
          { type: "system", subtype: "init", session_id: "claude-session" },
          {
            type: "assistant",
            message: { content: [{ type: "text", text: "  First\nmessage  " }] },
          },
          { type: "assistant", message: { content: [{ type: "text", text: "Second message" }] } },
          {
            type: "result",
            structured_output: { plan: "Review", questions: [] },
            modelUsage: {
              sonnet: {
                inputTokens: 73,
                outputTokens: 31,
                cacheReadInputTokens: 64,
                cacheCreationInputTokens: 16,
              },
              haiku: {
                inputTokens: 13,
                outputTokens: 8,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
              },
            },
          },
        ];
        child.stdout.end(events.map((event) => JSON.stringify(event)).join("\n") + "\n");
        child.emit("close", 0);
      });
      return child as unknown as ReturnType<typeof spawn>;
    });

    await expect(
      claude.plan({
        prompt: "Work item context",
        instructions: "Review only.",
        cwd: "/workspace",
        signal: new AbortController().signal,
        custom: { model: "sonnet", effort: "high", skillIds: [] },
        transcript,
      }),
    ).resolves.toEqual({ state: "ready", text: "Review" });
    expect(transcript.reportTokens).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ input: 166, output: 39, cacheRead: 64, cacheWrite: 16 }),
    );

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["--model", "sonnet", "--effort", "high", "stream-json", "--verbose"]),
      expect.objectContaining({
        env: expect.objectContaining({ CLAUDE_CODE_EFFORT_LEVEL: undefined }),
      }),
    );
    expect(process.env.CLAUDE_CODE_EFFORT_LEVEL).toBe("low");
    expect(transcript.mock.calls).toEqual([
      ["instructions", "Review only."],
      ["user", "Work item context"],
      ["session", "claude-session"],
      ["assistant", "  First\nmessage  "],
      ["assistant", "Second message"],
      ["result", JSON.stringify({ plan: "Review", questions: [] }, null, 2)],
    ]);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("reads Claude quota from a structured /usage report", async () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  vi.mocked(spawn).mockImplementation(() => {
    queueMicrotask(() => {
      child.stdout.end(
        JSON.stringify({
          type: "assistant",
          usage_report: {
            rate_limits: {
              limits: [
                { kind: "five_hour", percent: 42, resets_at: "2026-11-23T17:00:00Z" },
                {
                  kind: "seven_day",
                  percent: 31,
                  resets_at: null,
                  scope: { model: { display_name: "Sonnet" } },
                },
              ],
            },
          },
        }) + "\n",
      );
      child.emit("close", 0);
    });
    return child as unknown as ReturnType<typeof spawn>;
  });
  await expect(claude.quota("/isolated", new AbortController().signal)).resolves.toEqual([
    { label: "5-hour", usedPercent: 42, resetsAt: Date.parse("2026-11-23T17:00:00Z") },
    { label: "7-day · Sonnet", usedPercent: 31, resetsAt: null },
  ]);
  expect(spawn).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.arrayContaining(["--no-session-persistence", "--tools", "", "/usage"]),
    expect.objectContaining({ cwd: "/isolated" }),
  );
});
