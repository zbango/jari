export interface DesktopInfo {
  readonly name: string;
  readonly version: string;
}

export { releaseVersionFromTag } from "./release-version";
export {
  isWorkflowProvider,
  maxPlanAnswerLength,
  workflowChannels,
  workflowProviders,
} from "./workflow";
export type {
  CreateWorkflowInput,
  PlanClarification,
  WorkflowApi,
  WorkflowPlan,
  WorkflowProvider,
  WorkflowRecord,
} from "./workflow";
export type {
  AtlassianDocumentNode,
  WorkBoard,
  WorkItem,
  WorkItemSummary,
  WorkSprint,
} from "./work-source";
export { groupKnowledgeNotes } from "./knowledge";
export type {
  KnowledgeApi,
  KnowledgeContext,
  KnowledgeNote,
  KnowledgeNoteInput,
} from "./knowledge";
