import { spawnProvider } from "./process";
import type { ProviderAdapter } from "./types";

const claudeSchema = {
  type: "object",
  properties: {
    plan: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["plan", "questions"],
  additionalProperties: false,
};

export const claude: ProviderAdapter = {
  async plan({ prompt, instructions, cwd, signal }) {
    const child = spawnProvider(
      "claude",
      [
        "--print",
        "--permission-mode",
        "plan",
        "--safe-mode",
        "--restricted",
        "--strict-mcp-config",
        "--tools",
        "Read,Glob,Grep",
        "--permission-prompts",
        "none",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(claudeSchema),
        "--append-system-prompt",
        instructions,
      ],
      cwd,
      signal,
    );
    let output = "";
    child.stdout.setEncoding("utf8");
    return new Promise((resolve, reject) => {
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (output.length > 1_000_000) child.kill();
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code !== 0) {
          reject(
            new Error("Claude Code did not complete planning. Check its CLI version and sign-in."),
          );
          return;
        }
        try {
          const result = JSON.parse(output) as {
            is_error?: boolean;
            structured_output?: { plan?: unknown; questions?: unknown };
          };
          const data = result.structured_output;
          if (
            result.is_error ||
            !data ||
            typeof data.plan !== "string" ||
            !Array.isArray(data.questions) ||
            !data.questions.every((value: unknown) => typeof value === "string")
          ) {
            throw new Error(
              "Claude Code returned no valid planning result. Check its CLI version and sign-in.",
            );
          }
          if (data.questions.length) {
            resolve({ state: "needs-input", text: data.questions.join("\n") });
          } else if (data.plan.trim()) {
            resolve({ state: "ready", text: data.plan.trim() });
          } else {
            reject(new Error("Claude Code returned an empty plan."));
          }
        } catch {
          reject(
            new Error(
              "Claude Code returned no valid planning result. Check its CLI version and sign-in.",
            ),
          );
        }
      });
      child.stdin.end(prompt);
    });
  },
};
