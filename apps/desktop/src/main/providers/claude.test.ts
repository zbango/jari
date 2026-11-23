import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { claude } from "./claude";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

it("passes the chosen effort to Claude Code ahead of a local effort default", async () => {
  vi.stubEnv("CLAUDE_CODE_EFFORT_LEVEL", "low");
  const transcript = vi.fn();
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
          { type: "result", structured_output: { plan: "Review", questions: [] } },
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
