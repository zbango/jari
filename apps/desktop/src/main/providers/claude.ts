import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import type { PlanningOptions } from "@agent-desktop/shared";
import { providerOptions, spawnProvider } from "./process";
import { planningOutputSchema, readPlanningResult, selectPlanningSkills } from "./types";
import type { PlanningRequest, ProviderAdapter } from "./types";

const effortLevels = ["low", "medium", "high", "xhigh", "max"];

async function claudeOptions(cwd: string, signal: AbortSignal): Promise<PlanningOptions> {
  const { options } = providerOptions("claude", cwd, signal);
  const personal = resolve(cwd, options.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"));
  const roots = new Map([[join(personal, "skills"), "Personal skill"]]);
  for (let dir = cwd; dir !== dirname(dir); dir = dirname(dir)) {
    signal.throwIfAborted();
    roots.set(join(dir, ".claude", "skills"), "Workspace skill");
    if (
      await stat(join(dir, ".git")).then(
        () => true,
        () => false,
      )
    )
      break;
  }

  const skills: PlanningOptions["skills"] = [];
  for (const [root, description] of roots) {
    signal.throwIfAborted();
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
      const id = join(root, entry.name, "SKILL.md");
      if (
        await lstat(id).then(
          (info) => info.isFile(),
          () => false,
        )
      ) {
        skills.push({ id, name: entry.name, description });
      }
    }
  }
  return {
    efforts: effortLevels.map((id) => ({ id })),
    models: [
      { id: "sonnet", name: "Sonnet" },
      { id: "opus", name: "Opus" },
      { id: "haiku", name: "Haiku" },
      { id: "fable", name: "Fable" },
    ],
    skills,
  };
}

async function readSelectedSkills(
  cwd: string,
  ids: string[],
  signal: AbortSignal,
): Promise<string> {
  if (!ids.length) return "";
  const { skills } = await claudeOptions(cwd, signal);
  const selected = selectPlanningSkills(skills, ids);
  const content = [];
  let bytes = 0;
  for (const { id, name } of selected) {
    const file = await lstat(id);
    if (!file.isFile()) throw new Error("A selected Claude skill is no longer available.");
    bytes += file.size;
    if (bytes > 64_000)
      throw new Error("The selected Claude skills are too large. Select fewer skills.");
    content.push({ name, path: id, content: await readFile(id, { encoding: "utf8", signal }) });
  }
  return `\n\nSelected installed skill instructions:\n${JSON.stringify(content)}`;
}

async function runClaude(
  { prompt, instructions, cwd, signal, custom, transcript }: PlanningRequest,
  build: boolean,
) {
  const tools = build ? "Read,Glob,Grep,Edit,Write" : "Read,Glob,Grep";
  const effort = custom?.effort;
  if (effort && !effortLevels.includes(effort)) {
    throw new Error("Claude Code does not support the selected effort level.");
  }
  const skills = custom && !build ? await readSelectedSkills(cwd, custom.skillIds, signal) : "";
  const input = prompt + skills;
  transcript?.("instructions", instructions);
  transcript?.("user", input);
  const child = spawnProvider(
    "claude",
    [
      "--print",
      "--permission-mode",
      build || custom ? "dontAsk" : "plan",
      "--safe-mode",
      "--restricted",
      "--strict-mcp-config",
      "--tools",
      tools,
      ...(build || custom ? ["--allowedTools", tools] : []),
      ...(custom?.model ? ["--model", custom.model] : []),
      ...(effort ? ["--effort", effort] : []),
      "--permission-prompts",
      "none",
      "--output-format",
      "stream-json",
      "--verbose",
      ...(!build ? ["--json-schema", JSON.stringify(planningOutputSchema)] : []),
      "--append-system-prompt",
      instructions,
    ],
    cwd,
    signal,
    effort ? { CLAUDE_CODE_EFFORT_LEVEL: undefined } : undefined,
  );
  type ClaudeEvent = {
    type: string;
    subtype?: string;
    session_id?: string;
    message?: { content?: { type: string; text?: string }[] };
    is_error?: boolean;
    structured_output?: unknown;
    result?: string;
  };
  const lines = createInterface({ input: child.stdout });
  let result: ClaudeEvent | undefined;
  return new Promise<ClaudeEvent>((resolve, reject) => {
    lines.on("line", (line) => {
      let event: ClaudeEvent;
      try {
        event = JSON.parse(line) as ClaudeEvent;
      } catch {
        return;
      }
      try {
        if (event.type === "system" && event.subtype === "init" && event.session_id) {
          transcript?.("session", event.session_id);
        }
        if (event.type === "assistant") {
          for (const block of event.message?.content ?? []) {
            if (block.type === "text" && typeof block.text === "string") {
              transcript?.("assistant", block.text);
            }
          }
        }
        if (event.type === "result") {
          result = event;
          if (typeof event.result === "string") transcript?.("result", event.result);
          if (event.structured_output !== undefined) {
            transcript?.("result", JSON.stringify(event.structured_output, null, 2));
          }
        }
      } catch (error) {
        reject(error);
        child.kill();
      }
    });
    child.once("error", reject);
    child.once("close", (code) => {
      lines.close();
      if (code !== 0) {
        reject(
          new Error("Claude Code did not complete the run. Check its CLI version and sign-in."),
        );
        return;
      }
      if (!result || result.is_error) {
        reject(
          new Error("Claude Code returned no valid result. Check its CLI version and sign-in."),
        );
        return;
      }
      resolve(result);
    });
    child.stdin.end(input);
  });
}

export const claude: ProviderAdapter = {
  planningOptions: claudeOptions,
  async plan(request) {
    return readPlanningResult((await runClaude(request, false)).structured_output);
  },
  async build(request) {
    const { result } = await runClaude(request, true);
    if (!result?.trim()) throw new Error("Claude Code did not return an implementation summary.");
    return result.trim();
  },
};
