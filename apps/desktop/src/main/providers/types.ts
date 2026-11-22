import type { WorkflowPlan } from "@agent-desktop/shared";

export interface PlanningRequest {
  prompt: string;
  instructions: string;
  cwd: string;
  signal: AbortSignal;
}

export type PlanningResult = Extract<WorkflowPlan, { state: "ready" | "needs-input" }>;

export interface ProviderAdapter {
  plan(request: PlanningRequest): Promise<PlanningResult>;
}
