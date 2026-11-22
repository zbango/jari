import { execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { providerOptions, spawnProvider } from "./process";
import type { PlanningResult, ProviderAdapter } from "./types";

const planningFeatureFlags = ["--disable", "hooks", "--disable", "plugins", "--disable", "apps"];

type CodexMessage = {
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: unknown;
  params?: {
    threadId?: string;
    item?: { type: string; text?: string };
    turn?: { status: string };
  };
};

async function codexMcpOverrides(cwd: string, signal: AbortSignal): Promise<string[]> {
  const { executable, options } = providerOptions("codex", cwd, signal);
  let output: string;
  try {
    // Discover only the servers available with the same feature flags as the planning process.
    ({ stdout: output } = await promisify(execFile)(
      executable,
      ["mcp", "list", "--json", ...planningFeatureFlags],
      {
        ...options,
        timeout: 15_000,
      },
    ));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || ("code" in error && error.code === "ENOENT"))
    ) {
      throw error;
    }
    throw new Error(
      "Codex could not inspect its MCP configuration. Update the CLI or check its local configuration.",
    );
  }
  const servers: unknown = JSON.parse(output);
  if (!Array.isArray(servers)) throw new Error("Codex returned an unsupported MCP configuration.");
  return servers.flatMap((server: { enabled?: boolean; name?: unknown }) => {
    if (server.enabled === false) return [];
    if (typeof server.name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(server.name)) {
      throw new Error("Codex returned an invalid MCP server name.");
    }
    return ["-c", `mcp_servers.${server.name}.enabled=false`];
  });
}

export const codex: ProviderAdapter = {
  async plan({ prompt, instructions, cwd, signal }) {
    const overrides = await codexMcpOverrides(cwd, signal);
    const child = spawnProvider(
      "codex",
      ["app-server", "--listen", "stdio://", ...planningFeatureFlags, ...overrides],
      cwd,
      signal,
    );
    const lines = createInterface({ input: child.stdout });
    const pending = new Map<
      number,
      { resolve(result: unknown): void; reject(error: Error): void }
    >();
    let nextId = 0;
    let threadId: string | undefined;
    let plan = "";
    let reply = "";
    let phase = "startup";
    let finish: ((value: PlanningResult) => void) | undefined;
    let fail: ((error: Error) => void) | undefined;

    function handleExit(error: Error) {
      for (const request of pending.values()) request.reject(error);
      pending.clear();
      fail?.(error);
    }
    child.once("error", handleExit);
    child.once("close", (code, signal) => {
      const status = signal ? `signal ${signal}` : `exit code ${code}`;
      handleExit(new Error(`Codex App Server stopped during ${phase} (${status}).`));
    });

    lines.on("line", (line) => {
      let message: CodexMessage;
      try {
        message = JSON.parse(line) as CodexMessage;
      } catch {
        return;
      }
      if (message.id !== undefined && message.method) {
        // The planning client does not grant provider approvals or answer elicitation requests.
        child.stdin.write(
          `${JSON.stringify({
            id: message.id,
            error: {
              code: -32601,
              message: "Interactive provider requests are unavailable during planning.",
            },
          })}\n`,
        );
        return;
      }
      if (typeof message.id === "number") {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error)
          request?.reject(
            new Error("Codex rejected the request. Check its CLI version and sign-in."),
          );
        else request?.resolve(message.result);
        return;
      }

      const item = message.params?.item;
      if (!threadId || message.params?.threadId !== threadId) return;
      if (message.method === "item/completed" && typeof item?.text === "string") {
        if (item.type === "plan") plan = item.text;
        if (item.type === "agentMessage") reply = item.text;
      }
      if (message.method === "turn/completed") {
        if (message.params?.turn?.status !== "completed" || (!plan.trim() && !reply.trim())) {
          fail?.(
            new Error(
              "Codex did not return a plan. Check its sign-in and workspace configuration.",
            ),
          );
        } else {
          finish?.(
            plan.trim()
              ? { state: "ready", text: plan.trim() }
              : { state: "needs-input", text: reply.trim() },
          );
        }
      }
    });

    function request<T>(method: string, params: Record<string, unknown>): Promise<T> {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve: (result) => resolve(result as T), reject });
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      });
    }

    try {
      await request("initialize", {
        clientInfo: { name: "agent-desktop", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      phase = "Plan mode setup";
      child.stdin.write('{"method":"initialized"}\n');
      const modes = await request<{
        data: { mode?: string; model?: string; reasoning_effort?: string }[];
      }>("collaborationMode/list", {});
      const mode = modes.data.find((value) => value.mode === "plan");
      if (!mode) throw new Error("This Codex CLI does not expose Plan mode.");
      const started = await request<{ model: string; thread: { id: string } }>("thread/start", {
        cwd,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
      });
      threadId = started.thread.id;
      phase = "plan generation";
      const result = new Promise<PlanningResult>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      const [, completed] = await Promise.all([
        request("turn/start", {
          threadId,
          cwd,
          approvalPolicy: "never",
          sandboxPolicy: { type: "readOnly", networkAccess: false },
          input: [{ type: "text", text: `${instructions}\n\n${prompt}` }],
          collaborationMode: {
            mode: "plan",
            settings: {
              model: mode.model ?? started.model,
              reasoning_effort: mode.reasoning_effort ?? null,
              developer_instructions: null,
            },
          },
        }),
        result,
      ]);
      return completed;
    } finally {
      lines.close();
      child.stdin.destroy();
      child.kill();
    }
  },
};
