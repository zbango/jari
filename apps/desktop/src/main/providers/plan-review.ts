import type { PlanReview } from "@agent-desktop/shared";

const text = { type: "string" };
const textList = { type: "array", items: text };

export const planReviewSchema = {
  type: "object",
  properties: {
    findings: textList,
    proposal: text,
    considerations: textList,
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { title: text, detail: text, files: textList },
        required: ["title", "detail", "files"],
        additionalProperties: false,
      },
    },
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: text,
          action: { type: "string", enum: ["create", "update", "delete"] },
          summary: text,
          diff: text,
        },
        required: ["path", "action", "summary", "diff"],
        additionalProperties: false,
      },
    },
    reproduction: textList,
    verification: textList,
  },
  required: [
    "findings",
    "proposal",
    "considerations",
    "steps",
    "files",
    "reproduction",
    "verification",
  ],
  additionalProperties: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function readPlanReview(value: unknown): PlanReview | undefined {
  if (!isRecord(value)) return;
  const { findings, proposal, considerations, steps, files, reproduction, verification } = value;
  if (
    !isTextList(findings) ||
    typeof proposal !== "string" ||
    !proposal.trim() ||
    !isTextList(considerations) ||
    !Array.isArray(steps) ||
    !steps.every(
      (step): step is PlanReview["steps"][number] =>
        isRecord(step) &&
        typeof step.title === "string" &&
        typeof step.detail === "string" &&
        isTextList(step.files),
    ) ||
    !Array.isArray(files) ||
    !files.every(
      (file): file is PlanReview["files"][number] =>
        isRecord(file) &&
        typeof file.path === "string" &&
        typeof file.summary === "string" &&
        typeof file.diff === "string" &&
        (file.action === "create" || file.action === "update" || file.action === "delete"),
    ) ||
    !isTextList(reproduction) ||
    !isTextList(verification)
  )
    return;
  return { findings, proposal, considerations, steps, files, reproduction, verification };
}

export function readNativePlan(value: string): { text: string; review?: PlanReview } {
  const match = /(?:^|\r?\n)```jari-plan-review[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(value);
  if (match?.[1]) {
    const text = value.slice(0, match.index).trim();
    try {
      const review = readPlanReview(JSON.parse(match[1]));
      if (text && review) return { text, review };
    } catch {
      // Preserve the provider's plan when its optional review cannot be decoded.
    }
  }
  return { text: value.trim() };
}
