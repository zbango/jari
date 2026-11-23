import { workflowProviders } from "@agent-desktop/shared";
import type { BuildTaskReviewInput, WorkflowApi, WorkflowRecord } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Icon } from "@once-ui-system/core/components/Icon";
import { ProviderMessages } from "./provider-messages";
import { stages, stageStatus } from "./stages";
import type { Selection } from "./stages";
import { WorkItemPreview } from "./work-item-preview";
import { WorkflowBuildContent } from "./workflow-build-content";
import { WorkflowPlanContent } from "./workflow-plan-content";

export function WorkflowDetails({
  workflow,
  selection,
  openPlanReview,
  exportTranscript,
  readTranscript,
  providerLive,
  retryPlan,
  answerPlan,
  startBuild,
  reviewBuildTask,
  openJiraLink,
  loadIssue,
}: {
  workflow: WorkflowRecord;
  selection: Selection;
  openPlanReview(): void;
  exportTranscript(id: string): Promise<void>;
  readTranscript: WorkflowApi["readTranscript"];
  providerLive: boolean;
  retryPlan(): Promise<void>;
  answerPlan(answer: string): Promise<void>;
  startBuild(): Promise<void>;
  reviewBuildTask(input: BuildTaskReviewInput): Promise<void>;
  openJiraLink: WorkflowApi["openJiraLink"];
  loadIssue: WorkflowApi["linkedIssue"];
}) {
  const stage = stages[selection.stage];
  const section = Object.entries(stage.sections).find(([id]) => id === selection.section)?.[1];
  const status = stageStatus(selection.stage, true, workflow.plan, workflow.build);
  return (
    <>
      {section && <p className="inspector-breadcrumb">{stage.title}</p>}
      <h2>{section ?? stage.title}</h2>
      <span className="workflow-status inspector-status" data-kind={status.kind} role="status">
        <Icon name={status.icon} size="xs" decorative />
        {status.label}
      </span>
      {workflow.plan && selection.stage !== "idea" && (
        <ProviderMessages
          workflow={workflow}
          live={providerLive}
          readTranscript={readTranscript}
          exportTranscript={exportTranscript}
        />
      )}
      {selection.stage === "idea" && (
        <>
          {!selection.section || selection.section !== "workspace" ? (
            workflow.source ? (
              <WorkItemPreview
                key={workflow.source.key}
                issue={workflow.source}
                openJiraLink={openJiraLink}
                loadIssue={loadIssue}
              />
            ) : (
              <div className="inspector-field">
                <h3>Original request</h3>
                <p className="request-body">{workflow.request}</p>
              </div>
            )
          ) : null}
          {(!selection.section || selection.section === "workspace") && (
            <dl className="inspector-field">
              <dt>Provider</dt>
              <dd>{workflowProviders[workflow.provider]}</dd>
              <dt>Workspace</dt>
              <dd className="workspace-path">{workflow.workspacePath}</dd>
            </dl>
          )}
        </>
      )}
      {selection.stage === "plan" && (
        <div className="inspector-field">
          {workflow.plan && (
            <Button type="button" variant="secondary" onClick={openPlanReview}>
              Open plan review
            </Button>
          )}
          <WorkflowPlanContent workflow={workflow} retryPlan={retryPlan} answerPlan={answerPlan} />
        </div>
      )}
      {selection.stage === "build" && (
        <WorkflowBuildContent
          workflow={workflow}
          taskId={selection.taskId}
          openPlanReview={openPlanReview}
          startBuild={startBuild}
          reviewTask={reviewBuildTask}
        />
      )}
    </>
  );
}
