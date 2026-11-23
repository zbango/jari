import { execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import type { PlanningOptions } from "@agent-desktop/shared";
import { planReviewSchema, readNativePlan } from "./plan-review";
import { providerOptions, spawnProvider } from "./process";
import { planningOutputSchema, readPlanningResult, selectPlanningSkills } from "./types";
import type { ProviderAdapter, TranscriptWriter } from "./types";

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

interface CodexSession {
  request<T>(method: string, params: Record<string, unknown>): Promise<T>;
  onNotification(listener: (message: CodexMessage) => void): void;
  setPhase(phase: string): void;
}

async function withCodexServer<T>(
  cwd: string,
  signal: AbortSignal,
  run: (server: CodexSession) => Promise<T>,
): Promise<T> {
  const overrides = await codexMcpOverrides(cwd, signal);
  const child = spawnProvider(
    "codex",
    ["app-server", "--listen", "stdio://", ...planningFeatureFlags, ...overrides],
    cwd,
    signal,
  );
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, { resolve(result: unknown): void; reject(error: Error): void }>();
  let nextId = 0;
  let phase = "startup";
  let notification: ((message: CodexMessage) => void) | undefined;
  let rejectExit: (error: Error) => void;
  const exited = new Promise<never>((_, reject) => {
    rejectExit = reject;
  });

  function handleExit(error: Error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    rejectExit(error);
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

    notification?.(message);
  });

  function request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve: (result) => resolve(result as T), reject });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  async function initialize() {
    await request("initialize", {
      clientInfo: { name: "agent-desktop", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write('{"method":"initialized"}\n');
    return run({
      request,
      onNotification(listener) {
        notification = listener;
      },
      setPhase(nextPhase) {
        phase = nextPhase;
      },
    });
  }

  try {
    return await Promise.race([initialize(), exited]);
  } finally {
    lines.close();
    child.stdin.destroy();
    child.kill();
  }
}

async function codexSkills(
  request: CodexSession["request"],
  cwd: string,
): Promise<PlanningOptions["skills"]> {
  const result = await request<{
    data: { skills: { name: string; description: string; path: string; enabled: boolean }[] }[];
  }>("skills/list", { cwds: [cwd], forceReload: true });
  const skills = new Map<string, PlanningOptions["skills"][number]>();
  for (const group of result.data) {
    for (const skill of group.skills) {
      if (skill.enabled)
        skills.set(skill.path, {
          id: skill.path,
          name: skill.name,
          description: skill.description,
        });
    }
  }
  return [...skills.values()];
}

async function codexModels(request: CodexSession["request"]): Promise<PlanningOptions["models"]> {
  type ModelPage = {
    data: {
      model: string;
      displayName: string;
      supportedReasoningEfforts?: { reasoningEffort: string; description: string }[];
    }[];
    nextCursor: string | null;
  };
  const models: PlanningOptions["models"] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: ModelPage = await request("model/list", { cursor, includeHidden: false });
    models.push(
      ...page.data.map(({ model, displayName, supportedReasoningEfforts }) => ({
        id: model,
        name: displayName || model,
        efforts:
          supportedReasoningEfforts?.map(({ reasoningEffort, description }) => ({
            id: reasoningEffort,
            description,
          })) ?? [],
      })),
    );
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error("Codex returned a repeated model page.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return models;
}

async function codexTurn(
  { request, onNotification }: CodexSession,
  threadId: string,
  params: Record<string, unknown>,
  transcript?: TranscriptWriter,
) {
  let plan = "";
  let reply = "";
  const result = new Promise<{ plan: string; reply: string }>((resolve, reject) => {
    onNotification((message) => {
      if (message.params?.threadId !== threadId) return;
      const item = message.params.item;
      if (message.method === "item/completed" && typeof item?.text === "string") {
        try {
          if (item.type === "plan") transcript?.("result", item.text);
          if (item.type === "agentMessage") transcript?.("assistant", item.text);
        } catch (error) {
          reject(error);
          return;
        }
        if (item.type === "plan") plan = item.text.trim();
        if (item.type === "agentMessage") reply = item.text.trim();
      }
      if (message.method === "turn/completed") {
        if (message.params.turn?.status === "completed" && (plan || reply)) {
          resolve({ plan, reply });
        } else {
          reject(
            new Error(
              "Codex did not complete the turn. Check its sign-in and workspace configuration.",
            ),
          );
        }
      }
    });
  });
  const [, completed] = await Promise.all([request("turn/start", { threadId, ...params }), result]);
  return completed;
}

export const codex: ProviderAdapter = {
  planningOptions(cwd, signal) {
    return withCodexServer(cwd, signal, async ({ request, setPhase }) => {
      setPhase("model and skill discovery");
      const [models, skills] = await Promise.all([codexModels(request), codexSkills(request, cwd)]);
      return { models, skills };
    });
  },
  plan({ prompt, instructions, cwd, signal, custom, transcript }) {
    return withCodexServer(cwd, signal, async (server) => {
      const { request, setPhase } = server;
      setPhase("planning setup");
      const skills = custom?.skillIds.length
        ? selectPlanningSkills(await codexSkills(request, cwd), custom.skillIds)
        : [];
      let mode: { model?: string; reasoning_effort?: string } | undefined;
      if (!custom) {
        const modes = await request<{
          data: { mode?: string; model?: string; reasoning_effort?: string }[];
        }>("collaborationMode/list", {});
        mode = modes.data.find((value) => value.mode === "plan");
        if (!mode) throw new Error("This Codex CLI does not expose Plan mode.");
      }
      const started = await request<{ model: string; thread: { id: string } }>("thread/start", {
        cwd,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
        ...(custom?.model ? { model: custom.model } : {}),
      });
      const threadId = started.thread.id;
      setPhase("plan generation");
      const text = custom
        ? `${instructions}\n\n${prompt}`
        : `${instructions}\nAppend the review to the final native plan as a single fenced block labeled jari-plan-review, matching this JSON Schema: ${JSON.stringify(planReviewSchema)}. Keep the readable plan above the block.\n\n${prompt}`;
      transcript?.("session", threadId);
      transcript?.("user", text);
      const { plan, reply } = await codexTurn(
        server,
        threadId,
        {
          cwd,
          approvalPolicy: "never",
          sandboxPolicy: { type: "readOnly", networkAccess: false },
          input: [
            {
              type: "text",
              text,
              text_elements: [],
            },
            ...skills.map(({ name, id }) => ({ type: "skill", name, path: id })),
          ],
          ...(custom ? { outputSchema: planningOutputSchema } : {}),
          collaborationMode: {
            mode: custom ? "default" : "plan",
            settings: {
              model: custom?.model ?? mode?.model ?? started.model,
              reasoning_effort: custom?.effort ?? mode?.reasoning_effort ?? null,
              developer_instructions: null,
            },
          },
        },
        transcript,
      );
      if (custom) {
        try {
          return readPlanningResult(JSON.parse(reply));
        } catch {
          throw new Error("Codex returned an invalid custom planning result.");
        }
      }
      return plan
        ? { state: "ready", ...readNativePlan(plan) }
        : { state: "needs-input", text: reply };
    });
  },
  build({ cwd, instructions, prompt, signal, custom, transcript }) {
    return withCodexServer(cwd, signal, async (server) => {
      const { request, setPhase } = server;
      setPhase("build setup");
      const started = await request<{ model: string; thread: { id: string } }>("thread/start", {
        cwd,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        ephemeral: true,
        ...(custom?.model ? { model: custom.model } : {}),
      });
      setPhase("implementation");
      const text = `${instructions}\n\n${prompt}`;
      transcript?.("session", started.thread.id);
      transcript?.("user", text);
      const { reply } = await codexTurn(
        server,
        started.thread.id,
        {
          cwd,
          approvalPolicy: "never",
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: [cwd],
            networkAccess: false,
            excludeTmpdirEnvVar: true,
            excludeSlashTmp: true,
          },
          input: [{ type: "text", text, text_elements: [] }],
          collaborationMode: {
            mode: "default",
            settings: {
              model: custom?.model ?? started.model,
              reasoning_effort: custom?.effort ?? null,
              developer_instructions: null,
            },
          },
        },
        transcript,
      );
      if (!reply) throw new Error("Codex did not return an implementation summary.");
      return reply;
    });
  },
};
