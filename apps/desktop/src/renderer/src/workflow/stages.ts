import type { BuildTaskState, WorkflowBuild, WorkflowPlan } from "@agent-desktop/shared";

export const stages = {
  idea: {
    title: "Idea",
    icon: "lightbulb",
    description: "Inspect the work item and workspace.",
    sections: { request: "Request", workspace: "Workspace", context: "Context sources" },
  },
  plan: {
    title: "Plan",
    icon: "layers",
    description: "Review scope, tasks, and decisions.",
    sections: {
      context: "Context",
      scope: "Scope",
      tasks: "Tasks",
      roles: "Roles",
      permissions: "Permissions",
      risks: "Risks and assumptions",
      approval: "Plan approval",
    },
  },
  build: {
    title: "Build",
    icon: "code",
    description: "Inspect implementation and changes.",
    sections: {
      worktree: "Worktree",
      tasks: "Implementation tasks",
      files: "File changes",
      tools: "Tool activity",
      activity: "Agent activity",
      approvals: "Execution approvals",
      summary: "Implementation summary",
    },
  },
} as const;

export type Stage = keyof typeof stages;
export type Selection = { stage: Stage; section?: string; taskId?: string };
export const stageOrder: Stage[] = ["idea", "plan", "build"];

export const buildTaskStatus = {
  queued: { label: "Queued", kind: "waiting", icon: "time" },
  running: { label: "Building", kind: "running", icon: "time" },
  review: { label: "Needs review", kind: "waiting", icon: "message" },
  approved: { label: "Approved", kind: "saved", icon: "checkCircle" },
  failed: { label: "Failed", kind: "blocked", icon: "warning" },
  interrupted: { label: "Interrupted", kind: "blocked", icon: "pause" },
} as const satisfies Record<BuildTaskState, { label: string; kind: string; icon: string }>;

export function stageStatus(
  stage: Stage,
  hasWorkflow: boolean,
  plan?: WorkflowPlan,
  build?: WorkflowBuild,
) {
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
          return plan.reviewAttempt?.state === "running"
            ? { label: "Preparing review", kind: "running", icon: "time" as const }
            : {
                label: build ? "Approved" : "Draft ready",
                kind: "saved",
                icon: "checkCircle" as const,
              };
        case "needs-input":
          return { label: "Needs input", kind: "waiting", icon: "message" as const };
        case "failed":
          return { label: "Planning failed", kind: "blocked", icon: "warning" as const };
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
          return { label: "Build failed", kind: "blocked", icon: "warning" as const };
        case "interrupted":
          return { label: "Interrupted", kind: "blocked", icon: "pause" as const };
        default:
          return { label: "Blocked", kind: "blocked", icon: "lock" as const };
      }
  }
}
