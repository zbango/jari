export const stages = {
  idea: {
    title: "Idea",
    icon: "lightbulb",
    description: "Capture the request and its workspace.",
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
export type Selection = { stage: Stage; section?: string };
export const stageOrder: Stage[] = ["idea", "plan", "build"];

export function stageStatus(stage: Stage, hasWorkflow: boolean) {
  switch (stage) {
    case "idea":
      return hasWorkflow
        ? { label: "Request saved", kind: "saved", icon: "checkCircle" as const }
        : { label: "Awaiting request", kind: "waiting", icon: "time" as const };
    case "plan":
      return { label: "Pending", kind: "waiting", icon: "time" as const };
    case "build":
      return { label: "Blocked", kind: "blocked", icon: "lock" as const };
  }
}
