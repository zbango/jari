import type {
  CustomPlanOptions,
  PlanningOptions,
  PlanningSkill,
  ProviderTranscriptEntry,
  ProviderTokenUsage,
  ProviderQuotaWindow,
  WorkflowPlan,
} from "@agent-desktop/shared";
import { planReviewSchema, readPlanReview } from "./plan-review";

export interface PlanningRequest {
  prompt: string;
  instructions: string;
  cwd: string;
  signal: AbortSignal;
  custom?: CustomPlanOptions;
  transcript?: TranscriptWriter;
}

export type TranscriptWriter = {
  (kind: ProviderTranscriptEntry["kind"], text: string): void;
  reportTokens?(usage: ProviderTokenUsage): void;
};

export type PlanningResult = Extract<WorkflowPlan, { state: "ready" | "needs-input" }>;

export interface ProviderAdapter {
  planningOptions(cwd: string, signal: AbortSignal): Promise<PlanningOptions>;
  quota(cwd: string, signal: AbortSignal): Promise<ProviderQuotaWindow[]>;
  plan(request: PlanningRequest): Promise<PlanningResult>;
  build(request: PlanningRequest): Promise<string>;
}

export const planningOutputSchema = {
  type: "object",
  properties: {
    plan: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
    review: { anyOf: [planReviewSchema, { type: "null" }] },
  },
  required: ["plan", "questions", "review"],
  additionalProperties: false,
};

export function readPlanningResult(value: unknown): PlanningResult {
  if (
    !value ||
    typeof value !== "object" ||
    !("plan" in value) ||
    typeof value.plan !== "string" ||
    !("questions" in value) ||
    !Array.isArray(value.questions) ||
    !value.questions.every((question) => typeof question === "string")
  ) {
    throw new Error("The provider returned an invalid planning result.");
  }
  const questions = value.questions.map((question: string) => question.trim()).filter(Boolean);
  if (questions.length) return { state: "needs-input", text: questions.join("\n") };
  if (!value.plan.trim()) throw new Error("The provider returned an empty plan.");
  const review = "review" in value ? readPlanReview(value.review) : undefined;
  return { state: "ready", text: value.plan.trim(), ...(review ? { review } : {}) };
}

export function selectPlanningSkills(skills: PlanningSkill[], ids: string[]): PlanningSkill[] {
  return ids.map((id) => {
    const skill = skills.find((entry) => entry.id === id);
    if (!skill) throw new Error("A selected skill is no longer available in this workspace.");
    return skill;
  });
}
