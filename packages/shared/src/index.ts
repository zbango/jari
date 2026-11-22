export interface DesktopInfo {
  readonly name: string;
  readonly version: string;
}

export { releaseVersionFromTag } from "./release-version";

export {
  isWorkflowProvider,
  workflowChannels,
  workflowProviders,
  workflowRequestLimit,
} from "./workflow";
export type {
  CreateWorkflowInput,
  WorkflowApi,
  WorkflowProvider,
  WorkflowRecord,
} from "./workflow";
