export const workflowProviders = {
  codex: "Codex",
  claude: "Claude Code",
} as const;

export type WorkflowProvider = keyof typeof workflowProviders;

export function isWorkflowProvider(value: unknown): value is WorkflowProvider {
  return value === "codex" || value === "claude";
}

export const workflowRequestLimit = 10_000;

export interface CreateWorkflowInput {
  request: string;
  provider: WorkflowProvider;
  workspacePath: string;
}

export interface WorkflowRecord extends CreateWorkflowInput {
  id: string;
  createdAt: string;
}

export interface WorkflowApi {
  list(): Promise<WorkflowRecord[]>;
  chooseWorkspace(): Promise<string | null>;
  create(input: CreateWorkflowInput): Promise<WorkflowRecord>;
}

export const workflowChannels = {
  list: "workflow:list",
  chooseWorkspace: "workflow:choose-workspace",
  create: "workflow:create",
} as const;
