export interface DesktopInfo {
  readonly name: string;
  readonly version: string;
}

export { releaseVersionFromTag } from "./release-version";
export { workflowSectionSources, workflowSections } from "./workflow-sections";
export type {
  WorkflowSection,
  WorkflowSectionChange,
  WorkflowSectionInput,
} from "./workflow-sections";
export {
  isWorkflowProvider,
  maxPlanAnswerLength,
  pendingMilestones,
  nextManualMilestone,
  milestoneRequiresManualAction,
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
  MilestoneInput,
  MilestoneCommand,
  MilestoneTiming,
  PlanClarification,
  PlanReview,
  PlanRevision,
  PlanningOptions,
  PlanningSkill,
  ProviderRunMetric,
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
  ProviderTokenUsage,
  ProviderTranscriptEntry,
  ReplayPlanInput,
  SimulatedIssueInput,
  WorkflowApi,
  WorkflowBuild,
  WorkflowBuildTask,
  WorkflowMilestone,
  WorkflowStage,
  WorkflowStageSettings,
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
