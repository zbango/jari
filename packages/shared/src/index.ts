export interface DesktopInfo {
  readonly name: string;
  readonly version: string;
}

export { releaseVersionFromTag } from "./release-version";
export {
  isWorkflowProvider,
  maxPlanAnswerLength,
  simulatedIssueLimits,
  workflowChannels,
  workflowProviders,
} from "./workflow";
export type {
  BuildTaskReviewInput,
  BuildTaskState,
  CreateWorkflowInput,
  CustomPlanOptions,
  JiraResponse,
  PlanClarification,
  PlanReview,
  PlanRevision,
  PlanningOptions,
  PlanningSkill,
  ProviderTranscriptEntry,
  ReplayPlanInput,
  SimulatedIssueInput,
  WorkflowApi,
  WorkflowBuild,
  WorkflowBuildTask,
  WorkflowPlan,
  WorkflowProvider,
  WorkflowRecord,
} from "./workflow";
export type {
  AtlassianDocumentNode,
  WorkBoard,
  WorkItem,
  WorkItemLink,
  WorkItemSummary,
  WorkSprint,
} from "./work-source";
export { groupKnowledgeNotes } from "./knowledge";
export { openWorkItemBlockers } from "./work-source";
export type {
  KnowledgeApi,
  KnowledgeContext,
  KnowledgeNote,
  KnowledgeNoteInput,
} from "./knowledge";
