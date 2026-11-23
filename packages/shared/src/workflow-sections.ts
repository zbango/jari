import type { WorkflowRecord, WorkflowStage } from "./workflow";

export const workflowSectionSources = {
  idea: { request: "Request", workspace: "Workspace", context: "Context sources" },
  plan: {
    context: "Context",
    scope: "Scope",
    tasks: "Tasks",
    roles: "Provider settings",
    permissions: "Permissions",
    risks: "Risks and assumptions",
    approval: "Plan approval",
  },
  build: {
    worktree: "Worktree",
    tasks: "Implementation tasks",
    files: "File changes",
    tools: "Provider settings",
    activity: "Provider messages",
    approvals: "Execution approvals",
    summary: "Implementation summary",
  },
} as const;

export interface WorkflowSectionInput {
  source: string;
  title: string;
  notes: string;
}

export interface WorkflowSection extends WorkflowSectionInput {
  id: string;
}

export type WorkflowSectionChange =
  | { action: "save"; id: string | null; input: WorkflowSectionInput }
  | { action: "remove"; id: string };

export function workflowSections(
  stage: WorkflowStage,
  settings: WorkflowRecord["stageSettings"],
): WorkflowSection[] {
  return (
    settings?.[stage]?.sections ??
    Object.entries(workflowSectionSources[stage]).map(([source, title]) => ({
      id: source,
      source,
      title,
      notes: "",
    }))
  );
}
