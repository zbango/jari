import type { WorkBoard, WorkItem, WorkItemSummary, WorkSprint } from "./work-source";
import type { KnowledgeApi, KnowledgeContext } from "./knowledge";

export const workflowProviders = {
  codex: "Codex",
  claude: "Claude Code",
} as const;

export type WorkflowProvider = keyof typeof workflowProviders;

export function isWorkflowProvider(value: unknown): value is WorkflowProvider {
  return value === "codex" || value === "claude";
}

export interface SimulatedIssueInput {
  title: string;
  description: string;
}

export const simulatedIssueLimits = { title: 160, description: 24_000 } as const;

export type CreateWorkflowInput = {
  provider: WorkflowProvider;
  workspacePath: string;
  knowledgeNoteIds?: string[];
  customPlan?: CustomPlanOptions;
} & (
  | { issueKey: string; simulatedIssue?: never }
  | { simulatedIssue: SimulatedIssueInput; issueKey?: never }
);

export interface CustomPlanOptions {
  model?: string;
  effort?: string;
  skillIds: string[];
}

export interface PlanningSkill {
  id: string;
  name: string;
  description?: string;
}

interface PlanningEffort {
  id: string;
  description?: string;
}

export interface PlanningOptions {
  models: { id: string; name: string; efforts?: PlanningEffort[] }[];
  efforts?: PlanningEffort[];
  skills: PlanningSkill[];
}

export const maxPlanAnswerLength = 12_000;

export interface PlanClarification {
  questions: string;
  answer: string;
}

export type ReplayPlanInput =
  | { mode: "revise"; feedback: string }
  | { mode: "fresh"; provider: WorkflowProvider; customPlan?: CustomPlanOptions };

export interface PlanRevision {
  previousPlan: string;
  feedback: string;
}

export interface PlanReview {
  findings: string[];
  proposal: string;
  considerations: string[];
  steps: { title: string; detail: string; files: string[] }[];
  files: { path: string; action: "create" | "update" | "delete"; summary: string; diff: string }[];
  reproduction: string[];
  verification: string[];
}

export type WorkflowPlan = (
  | { state: "running" }
  | {
      state: "ready";
      text: string;
      review?: PlanReview;
      reviewAttempt?: { state: "running" } | { state: "failed"; message: string };
    }
  | { state: "needs-input"; text: string }
  | { state: "failed"; message: string }
  | { state: "interrupted" }
) & { clarifications?: PlanClarification[]; custom?: CustomPlanOptions; revision?: PlanRevision };

export type BuildTaskState =
  | "queued"
  | "running"
  | "review"
  | "approved"
  | "failed"
  | "interrupted";

export interface WorkflowBuildTask {
  id: string;
  title: string;
  detail: string;
  files: string[];
  state: BuildTaskState;
  attempt: number;
  summary?: string;
  message?: string;
  revisions: { summary: string; feedback: string }[];
  git?: {
    branch: string;
    base: string | null;
    review?: { tree: string; files: string[]; subject: string };
    commit?: { hash: string; subject: string };
  };
}

export interface BuildTaskReviewInput {
  taskId: string;
  attempt: number;
  feedback?: string;
  commitSubject?: string;
}

export type WorkflowBuild = { approvedAt: string; tasks?: WorkflowBuildTask[] } & (
  | { state: "ready" | "running" | "review" | "interrupted" }
  | { state: "completed"; summary: string }
  | { state: "failed"; message: string }
);

export interface WorkflowRecord {
  id: string;
  request: string;
  provider: WorkflowProvider;
  workspacePath: string;
  createdAt: string;
  source?: WorkItem;
  plan?: WorkflowPlan;
  build?: WorkflowBuild;
  knowledge?: KnowledgeContext[];
}

export interface ProviderTranscriptEntry {
  sequence: number;
  runId: string;
  phase: "Plan" | "Plan review" | "Build";
  taskId: string | null;
  attempt: number | null;
  createdAt: string;
  kind: "instructions" | "user" | "assistant" | "result" | "session";
  text: string;
}

export interface ProviderTranscriptPage {
  entries: ProviderTranscriptEntry[];
  hasMore: boolean;
}

export interface JiraResponse<T> {
  data: T;
  syncedAt: number;
  source: "jira" | "cache";
  syncError?: string;
}

export interface WorkflowApi {
  knowledge: KnowledgeApi;
  list(): Promise<WorkflowRecord[]>;
  removeWorkflow(id: string): Promise<void>;
  readTranscript(id: string, after: number): Promise<ProviderTranscriptPage>;
  exportTranscript(id: string): Promise<boolean>;
  restoreWorkspace(): Promise<string | null>;
  chooseWorkspace(): Promise<string | null>;
  openWorkspaceInCursor(id: string): Promise<void>;
  assignedSprintIssues(sync?: boolean): Promise<JiraResponse<WorkItemSummary[]>>;
  boards(sync?: boolean): Promise<JiraResponse<WorkBoard[]>>;
  activeSprints(boardId: number, sync?: boolean): Promise<JiraResponse<WorkSprint[]>>;
  sprintIssues(
    boardId: number,
    sprintId: number,
    sync?: boolean,
  ): Promise<JiraResponse<WorkItemSummary[]>>;
  issue(key: string, sync?: boolean): Promise<JiraResponse<WorkItem>>;
  linkedIssue(key: string, sync?: boolean): Promise<JiraResponse<WorkItem>>;
  openJiraLink(url: string): Promise<void>;
  create(input: CreateWorkflowInput): Promise<WorkflowRecord>;
  retryPlan(id: string): Promise<WorkflowRecord>;
  replayPlan(id: string, input: ReplayPlanInput): Promise<WorkflowRecord>;
  answerPlan(id: string, answer: string): Promise<WorkflowRecord>;
  generatePlanReview(id: string): Promise<WorkflowRecord>;
  approvePlan(id: string): Promise<WorkflowRecord>;
  startBuild(id: string): Promise<WorkflowRecord>;
  reviewBuildTask(id: string, input: BuildTaskReviewInput): Promise<WorkflowRecord>;
  planningOptions(
    provider: WorkflowProvider,
    workspacePath: string,
    workflowId?: string,
  ): Promise<PlanningOptions>;
}

export const workflowChannels = {
  list: "workflow:list",
  removeWorkflow: "workflow:remove",
  readTranscript: "workflow:read-transcript",
  exportTranscript: "workflow:export-transcript",
  restoreWorkspace: "workflow:restore-workspace",
  chooseWorkspace: "workflow:choose-workspace",
  openWorkspaceInCursor: "workflow:open-workspace-in-cursor",
  assignedSprintIssues: "jira:assigned-sprint-issues",
  boards: "jira:boards",
  activeSprints: "jira:active-sprints",
  sprintIssues: "jira:sprint-issues",
  issue: "jira:issue",
  linkedIssue: "jira:linked-issue",
  openJiraLink: "jira:open-link",
  create: "workflow:create",
  retryPlan: "workflow:retry-plan",
  replayPlan: "workflow:replay-plan",
  answerPlan: "workflow:answer-plan",
  generatePlanReview: "workflow:generate-plan-review",
  approvePlan: "workflow:approve-plan",
  startBuild: "workflow:start-build",
  reviewBuildTask: "workflow:review-build-task",
  planningOptions: "workflow:planning-options",
  listKnowledge: "knowledge:list",
  saveKnowledge: "knowledge:save",
  removeKnowledge: "knowledge:remove",
} as const;
