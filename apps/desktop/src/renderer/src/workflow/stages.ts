import type { BuildTaskState, WorkflowBuild, WorkflowPlan } from "@agent-desktop/shared";
import type { Icon } from "@once-ui-system/core/components/Icon";
import type { ComponentProps } from "react";

export const stages = {
  idea: {
    title: "Idea",
    icon: "lightbulb",
    description: "Inspect the work item and workspace.",
  },
  plan: {
    title: "Plan",
    icon: "layers",
    description: "Review scope, tasks, and decisions.",
  },
  build: {
    title: "Build",
    icon: "code",
    description: "Inspect implementation and changes.",
  },
} as const;

export type Stage = keyof typeof stages;
export type Selection = {
  stage: Stage;
  section?: string;
  taskId?: string;
  milestoneId?: string;
  queue?: boolean;
};
export type WorkflowStatusKind = "waiting" | "running" | "review" | "saved" | "failed" | "blocked";
type WorkflowStatus = {
  label: string;
  kind: WorkflowStatusKind;
  icon: ComponentProps<typeof Icon>["name"];
};
export const stageOrder: Stage[] = ["idea", "plan", "build"];

export const buildTaskStatus = {
  queued: { label: "Queued", kind: "waiting", icon: "time" },
  running: { label: "Building", kind: "running", icon: "time" },
  review: { label: "Needs review", kind: "review", icon: "message" },
  approved: { label: "Approved", kind: "saved", icon: "checkCircle" },
  failed: { label: "Failed", kind: "failed", icon: "warning" },
  interrupted: { label: "Interrupted", kind: "blocked", icon: "pause" },
} as const satisfies Record<BuildTaskState, WorkflowStatus>;

export function stageStatus(
  stage: Stage,
  hasWorkflow: boolean,
  plan?: WorkflowPlan,
  build?: WorkflowBuild,
): WorkflowStatus {
  switch (stage) {
    case "idea":
      return hasWorkflow
        ? { label: "Request saved", kind: "saved", icon: "checkCircle" as const }
        : { label: "Choose an issue", kind: "waiting", icon: "time" as const };
    case "plan":
      switch (plan?.state) {
        case "running":
          return { label: "Planning", kind: "running", icon: "time" as const };
        case "ready":
          if (plan.reviewAttempt?.state === "running") {
            return { label: "Preparing review", kind: "running", icon: "time" as const };
          }
          if (plan.reviewAttempt?.state === "failed") {
            return { label: "Review failed", kind: "failed", icon: "warning" as const };
          }
          return build
            ? { label: "Approved", kind: "saved", icon: "checkCircle" as const }
            : { label: "Draft ready", kind: "review", icon: "document" as const };
        case "needs-input":
          return { label: "Needs input", kind: "review", icon: "message" as const };
        case "failed":
          return { label: "Planning failed", kind: "failed", icon: "warning" as const };
        case "interrupted":
          return { label: "Interrupted", kind: "blocked", icon: "pause" as const };
        default:
          return { label: "Pending", kind: "waiting", icon: "time" as const };
      }
    case "build":
      switch (build?.state) {
        case "ready":
          return { label: "Ready", kind: "waiting", icon: "time" as const };
        case "running":
          return { label: "Building", kind: "running", icon: "time" as const };
        case "review":
          return buildTaskStatus.review;
        case "completed":
          return { label: "Completed", kind: "saved", icon: "checkCircle" as const };
        case "failed":
          return { label: "Build failed", kind: "failed", icon: "warning" as const };
        case "interrupted":
          return { label: "Interrupted", kind: "blocked", icon: "pause" as const };
        default:
          return { label: "Blocked", kind: "blocked", icon: "lock" as const };
      }
  }
}
