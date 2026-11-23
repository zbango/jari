import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { codex } from "./codex";

const { listServers, spawnProvider } = vi.hoisted(() => ({
  listServers: vi.fn(),
  spawnProvider: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: listServers }),
}));
vi.mock("./process", () => ({
  providerOptions: () => ({ executable: "codex", options: { cwd: "/workspace" } }),
  spawnProvider,
}));

it("starts Build in default mode with a workspace-write sandbox and approvals off", async () => {
  const transcript = vi.fn();
  listServers.mockResolvedValue({ stdout: "[]" });
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    kill: vi.fn(),
  });
  spawnProvider.mockReturnValue(child);
  child.stdin.on("data", (chunk) => {
    const { id, method, params } = JSON.parse(chunk.toString());
    const send = (message: unknown) => child.stdout.write(`${JSON.stringify(message)}\n`);
    if (method === "initialize") send({ id, result: {} });
    if (method === "thread/start") {
      expect(params.sandbox).toBe("workspace-write");
      expect(params.approvalPolicy).toBe("never");
      send({ id, result: { model: "fixture-model", thread: { id: "build-thread" } } });
    }
    if (method === "turn/start") {
      expect(params.collaborationMode.mode).toBe("default");
      expect(params.sandboxPolicy).toEqual({
        type: "workspaceWrite",
        writableRoots: ["/workspace"],
        networkAccess: false,
        excludeTmpdirEnvVar: true,
        excludeSlashTmp: true,
      });
      send({ id, result: {} });
      send({
        method: "item/completed",
        params: {
          threadId: "build-thread",
          item: { type: "agentMessage", text: "  Inspecting files.\n  " },
        },
      });
      send({
        method: "item/completed",
        params: {
          threadId: "build-thread",
          item: { type: "agentMessage", text: "Added the task tracker." },
        },
      });
      send({
        method: "turn/completed",
        params: { threadId: "build-thread", turn: { status: "completed" } },
      });
    }
  });
  await expect(
    codex.build({
      prompt: "Approved plan: build the tracker.",
      instructions: "Implement the approved plan.",
      cwd: "/workspace",
      signal: new AbortController().signal,
      transcript,
    }),
  ).resolves.toBe("Added the task tracker.");
  expect(transcript.mock.calls).toEqual([
    ["session", "build-thread"],
    ["user", "Implement the approved plan.\n\nApproved plan: build the tracker."],
    ["assistant", "  Inspecting files.\n  "],
    ["assistant", "Added the task tracker."],
  ]);
});

it("discovers MCP servers with plugins disabled before starting read-only planning", async () => {
  const review = {
    findings: ["The renderer owns the payment view."],
    proposal: "Show the settlement state.",
    considerations: [],
    steps: [],
    files: [],
    reproduction: [],
    verification: ["Open the payment view."],
  };
  listServers.mockImplementation((_executable: string, args: string[]) => {
    const servers = [{ name: "workspace-docs", enabled: true }];
    if (!args.includes("plugins")) servers.push({ name: "plugin-only", enabled: true });
    return Promise.resolve({ stdout: JSON.stringify(servers) });
  });
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    kill: vi.fn(),
  });
  spawnProvider.mockImplementation((_provider: string, args: string[]) => {
    if (args.includes("mcp_servers.plugin-only.enabled=false")) {
      queueMicrotask(() => child.emit("close", 1, null));
    }
    return child;
  });
  child.stdin.on("data", (chunk) => {
    const { id, method, params } = JSON.parse(chunk.toString());
    const respond = (result: unknown) => child.stdout.write(`${JSON.stringify({ id, result })}\n`);
    if (method === "initialize") respond({});
    if (method === "collaborationMode/list") respond({ data: [{ mode: "plan" }] });
    if (method === "thread/start") {
      expect(params.sandbox).toBe("read-only");
      respond({ thread: { id: "thread-1" }, model: "fixture-model" });
    }
    if (method === "turn/start") {
      expect(params.collaborationMode.mode).toBe("plan");
      respond({});
      const notification = { threadId: "thread-1" };
      for (const message of [
        {
          method: "item/completed",
          params: {
            ...notification,
            item: {
              type: "plan",
              text: `Proposed plan\n\n\`\`\`jari-plan-review\n${JSON.stringify(review)}\n\`\`\``,
            },
          },
        },
        { method: "turn/completed", params: { ...notification, turn: { status: "completed" } } },
      ]) {
        child.stdout.write(`${JSON.stringify(message)}\n`);
      }
    }
  });

  await expect(
    codex.plan({
      prompt: "Work item context",
      instructions: "Review only.",
      cwd: "/workspace",
      signal: new AbortController().signal,
    }),
  ).resolves.toEqual({ state: "ready", text: "Proposed plan", review });
  const flags = ["--disable", "hooks", "--disable", "plugins", "--disable", "apps"];
  expect(listServers).toHaveBeenCalledWith(
    "codex",
    ["mcp", "list", "--json", ...flags],
    expect.any(Object),
  );
  expect(spawnProvider).toHaveBeenCalledWith(
    "codex",
    [
      "app-server",
      "--listen",
      "stdio://",
      ...flags,
      "-c",
      "mcp_servers.workspace-docs.enabled=false",
    ],
    "/workspace",
    expect.any(AbortSignal),
  );
});

it("uses discoverable skills, model, and effort for custom planning", async () => {
  listServers.mockResolvedValue({ stdout: "[]" });
  const path = "/workspace/.agents/skills/review/SKILL.md";
  spawnProvider.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      kill: vi.fn(),
    });
    child.stdin.on("data", (chunk) => {
      const { id, method, params } = JSON.parse(chunk.toString());
      const emit = (message: object) => child.stdout.write(`${JSON.stringify(message)}\n`);
      const respond = (result: unknown) => emit({ id, result });
      switch (method) {
        case "initialize":
          respond({});
          break;
        case "skills/list":
          expect(params.cwds).toEqual(["/workspace"]);
          respond({
            data: [
              {
                skills: [
                  { name: "review", description: "Review plans", path, enabled: true },
                  { name: "hidden", path: "/disabled", enabled: false },
                ],
              },
            ],
          });
          break;
        case "model/list":
          expect(params.includeHidden).toBe(false);
          respond({
            data: [
              {
                model: "fixture-model",
                displayName: "Fixture",
                supportedReasoningEfforts: [
                  { reasoningEffort: "high", description: "Deeper reasoning" },
                ],
              },
            ],
            nextCursor: null,
          });
          break;
        case "thread/start":
          expect(params.model).toBe("fixture-model");
          respond({ thread: { id: "thread-1" }, model: "fixture-model" });
          break;
        case "turn/start":
          expect(params.collaborationMode).toMatchObject({
            mode: "default",
            settings: { model: "fixture-model", reasoning_effort: "high" },
          });
          expect(params.sandboxPolicy).toEqual({ type: "readOnly", networkAccess: false });
          expect(params.input).toContainEqual({ type: "skill", name: "review", path });
          expect(params.outputSchema.required).toEqual(["plan", "questions", "review"]);
          respond({});
          emit({
            method: "item/completed",
            params: {
              threadId: "thread-1",
              item: {
                type: "agentMessage",
                text: JSON.stringify({ plan: "", questions: ["Which users are included?"] }),
              },
            },
          });
          emit({
            method: "turn/completed",
            params: { threadId: "thread-1", turn: { status: "completed" } },
          });
          break;
        case "initialized":
          break;
        default:
          throw new Error(`Unexpected request ${method}`);
      }
    });
    return child;
  });
  const signal = new AbortController().signal;
  await expect(codex.planningOptions("/workspace", signal)).resolves.toEqual({
    models: [
      {
        id: "fixture-model",
        name: "Fixture",
        efforts: [{ id: "high", description: "Deeper reasoning" }],
      },
    ],
    skills: [{ id: path, name: "review", description: "Review plans" }],
  });
  await expect(
    codex.plan({
      prompt: "Work item context",
      instructions: "Review only.",
      cwd: "/workspace",
      signal,
      custom: { model: "fixture-model", effort: "high", skillIds: [path] },
    }),
  ).resolves.toEqual({ state: "needs-input", text: "Which users are included?" });
});
