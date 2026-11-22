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

it("discovers MCP servers with plugins disabled before starting read-only planning", async () => {
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
          params: { ...notification, item: { type: "plan", text: "Proposed plan" } },
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
  ).resolves.toEqual({ state: "ready", text: "Proposed plan" });
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
