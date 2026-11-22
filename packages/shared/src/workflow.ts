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

export interface CreateWorkflowInput {
  issueKey: string;
  provider: WorkflowProvider;
  workspacePath: string;
  knowledgeNoteIds?: string[];
}

export const maxPlanAnswerLength = 12_000;

export interface PlanClarification {
  questions: string;
  answer: string;
}

export type WorkflowPlan = (
  | { state: "running" }
  | { state: "ready"; text: string }
  | { state: "needs-input"; text: string }
  | { state: "failed"; message: string }
  | { state: "interrupted" }
) & { clarifications?: PlanClarification[] };

export interface WorkflowRecord {
  id: string;
  request: string;
  provider: WorkflowProvider;
  workspacePath: string;
  createdAt: string;
  source?: WorkItem;
  plan?: WorkflowPlan;
  knowledge?: KnowledgeContext[];
}

export interface WorkflowApi {
  knowledge: KnowledgeApi;
  list(): Promise<WorkflowRecord[]>;
  chooseWorkspace(): Promise<string | null>;
  assignedSprintIssues(): Promise<WorkItemSummary[]>;
  boards(): Promise<WorkBoard[]>;
  activeSprints(boardId: number): Promise<WorkSprint[]>;
  sprintIssues(boardId: number, sprintId: number): Promise<WorkItemSummary[]>;
  issue(key: string): Promise<WorkItem>;
  openJiraLink(url: string): Promise<void>;
  create(input: CreateWorkflowInput): Promise<WorkflowRecord>;
  retryPlan(id: string): Promise<WorkflowRecord>;
  answerPlan(id: string, answer: string): Promise<WorkflowRecord>;
}

export const workflowChannels = {
  list: "workflow:list",
  chooseWorkspace: "workflow:choose-workspace",
  assignedSprintIssues: "jira:assigned-sprint-issues",
  boards: "jira:boards",
  activeSprints: "jira:active-sprints",
  sprintIssues: "jira:sprint-issues",
  issue: "jira:issue",
  openJiraLink: "jira:open-link",
  create: "workflow:create",
  retryPlan: "workflow:retry-plan",
  answerPlan: "workflow:answer-plan",
  listKnowledge: "knowledge:list",
  saveKnowledge: "knowledge:save",
  removeKnowledge: "knowledge:remove",
} as const;
