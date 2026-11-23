import { workflowProviders } from "@agent-desktop/shared";
import type { BuildTaskReviewInput, WorkflowApi, WorkflowRecord } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Icon } from "@once-ui-system/core/components/Icon";
import { InlineCode } from "@once-ui-system/core/components/InlineCode";
import { Text } from "@once-ui-system/core/components/Text";
import { PlanSteps, PlannedFileChanges, ReviewList } from "./plan-review-sections";
import { ProviderMessages } from "./provider-messages";
import { buildTaskStatus, stages, stageStatus } from "./stages";
import type { Selection } from "./stages";
import { WorkItemPreview } from "./work-item-preview";
import { WorkflowBuildContent } from "./workflow-build-content";
import { WorkflowKnowledge, WorkflowPlanContent } from "./workflow-plan-content";

function WorkspaceDetails({ workflow }: { workflow: WorkflowRecord }) {
  return (
    <dl className="inspector-field">
      <dt>Provider</dt>
      <dd>{workflowProviders[workflow.provider]}</dd>
      <dt>Workspace</dt>
      <dd className="workspace-path">{workflow.workspacePath}</dd>
    </dl>
  );
}

function ContextDetails({ workflow }: { workflow: WorkflowRecord }) {
  const { source, plan, knowledge } = workflow;
  return (
    <Column gap="12">
      {source?.description && (
        <Text as="p" className="request-body">
          {source.description}
        </Text>
      )}
      <ReviewList
        title="Linked issues"
        items={
          source?.linkedIssues?.map(({ key, relationship }) => `${key} · ${relationship}`) ?? []
        }
      />
      <ReviewList
        title="Referenced documents"
        items={source?.references.map(({ title }) => title) ?? []}
      />
      <ReviewList
        title="Findings"
        items={plan?.state === "ready" ? (plan.review?.findings ?? []) : []}
      />
      <WorkflowKnowledge notes={knowledge} />
    </Column>
  );
}

function PlanningSettings({ workflow }: { workflow: WorkflowRecord }) {
  const custom = workflow.plan?.custom;
  return (
    <dl className="inspector-field">
      <dt>Provider</dt>
      <dd>{workflowProviders[workflow.provider]}</dd>
      <dt>Model</dt>
      <dd>{custom?.model ?? "Provider default"}</dd>
      <dt>Reasoning effort</dt>
      <dd>{custom?.effort ?? "Provider default"}</dd>
      {!!custom?.skillIds.length && (
        <>
          <dt>Planning skills</dt>
          <dd>
            <Column gap="4">
              {custom.skillIds.map((id) => (
                <InlineCode key={id} className="request-body">
                  {id}
                </InlineCode>
              ))}
            </Column>
          </dd>
        </>
      )}
    </dl>
  );
}

function PlanSection({ section, workflow }: { section: string; workflow: WorkflowRecord }) {
  const review = workflow.plan?.state === "ready" ? workflow.plan.review : undefined;
  switch (section) {
    case "context":
      return <ContextDetails workflow={workflow} />;
    case "roles":
      return <PlanningSettings workflow={workflow} />;
    case "permissions":
      return (
        <Text as="p">
          Planning reads the workspace. Build can edit workspace files after you approve the plan.
        </Text>
      );
    case "approval":
      return (
        <Text as="p">
          {workflow.build
            ? "The plan is approved for Build."
            : "Open the plan review to read the proposal and approve it."}
        </Text>
      );
    case "scope":
      return (
        <Text as="p" className="request-body">
          {review?.proposal ?? "The proposed scope will appear after the structured review."}
        </Text>
      );
    case "tasks":
      return review?.steps.length ? (
        <PlanSteps steps={review.steps} />
      ) : (
        <Text as="p">No implementation steps have been recorded.</Text>
      );
    case "risks":
      return review?.considerations.length ? (
        <ReviewList title="Considerations and trade-offs" items={review.considerations} />
      ) : (
        <Text as="p">No risks or assumptions have been recorded.</Text>
      );
    default:
      return null;
  }
}

export function WorkflowDetails({
  workflow,
  selection,
  openPlanReview,
  exportTranscript,
  readTranscript,
  retryPlan,
  answerPlan,
  startBuild,
  reviewBuildTask,
  readCommitDiff,
  openJiraLink,
  loadIssue,
}: {
  workflow: WorkflowRecord;
  selection: Selection;
  openPlanReview(): void;
  exportTranscript(id: string): Promise<void>;
  readTranscript: WorkflowApi["readTranscript"];
  retryPlan(): Promise<void>;
  answerPlan(answer: string): Promise<void>;
  startBuild(commitBaseline?: boolean): Promise<void>;
  reviewBuildTask(input: BuildTaskReviewInput): Promise<void>;
  readCommitDiff: WorkflowApi["readBuildCommitDiff"];
  openJiraLink: WorkflowApi["openJiraLink"];
  loadIssue: WorkflowApi["linkedIssue"];
}) {
  const stage = stages[selection.stage];
  const section = Object.entries(stage.sections).find(([id]) => id === selection.section)?.[1];
  const task = workflow.build?.tasks?.find(({ id }) => id === selection.taskId);
  const status = task
    ? buildTaskStatus[task.state]
    : stageStatus(selection.stage, true, workflow.plan, workflow.build);
  const review = workflow.plan?.state === "ready" ? workflow.plan.review : undefined;
  const overview = !selection.section || selection.section === "approvals" || task;
  const providerLive = task
    ? task.state === "running"
    : selection.stage === "plan"
      ? workflow.plan?.state === "running" ||
        (workflow.plan?.state === "ready" && workflow.plan.reviewAttempt?.state === "running")
      : workflow.build?.state === "running";
  return (
    <>
      {(section || task) && <p className="inspector-breadcrumb">{stage.title}</p>}
      <h2>{task ? `${task.id}. ${task.title}` : (section ?? stage.title)}</h2>
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
          phase={selection.stage === "plan" ? "Plan" : "Build"}
          taskId={task?.id}
        />
      )}
      {selection.stage === "idea" && (
        <>
          {(!selection.section || selection.section === "request") &&
            (workflow.source ? (
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
            ))}
          {(!selection.section || selection.section === "workspace") && (
            <WorkspaceDetails workflow={workflow} />
          )}
          {selection.section === "context" && <ContextDetails workflow={workflow} />}
        </>
      )}
      {selection.stage === "plan" && (
        <div className="inspector-field">
          {workflow.plan && (
            <Button type="button" variant="secondary" onClick={openPlanReview}>
              Open plan review
            </Button>
          )}
          {selection.section ? (
            <PlanSection section={selection.section} workflow={workflow} />
          ) : (
            <WorkflowPlanContent
              workflow={workflow}
              retryPlan={retryPlan}
              answerPlan={answerPlan}
            />
          )}
        </div>
      )}
      {selection.stage === "build" && overview && (
        <WorkflowBuildContent
          workflow={workflow}
          taskId={task?.id}
          openPlanReview={openPlanReview}
          startBuild={startBuild}
          reviewTask={reviewBuildTask}
          readCommitDiff={readCommitDiff}
        />
      )}
      {selection.stage === "build" && !overview && (
        <Column gap="12" className="inspector-field">
          {selection.section === "worktree" && <WorkspaceDetails workflow={workflow} />}
          {selection.section === "tasks" &&
            (review?.steps.length ? (
              <PlanSteps steps={review.steps} />
            ) : (
              <Text>No implementation steps have been recorded.</Text>
            ))}
          {selection.section === "files" &&
            (review?.files.length ? (
              <PlannedFileChanges files={review.files} />
            ) : (
              <Text>No proposed file changes have been recorded.</Text>
            ))}
          {selection.section === "tools" && <PlanningSettings workflow={workflow} />}
          {selection.section === "activity" && (
            <Text>Open live messages to see Build calls and their results.</Text>
          )}
          {selection.section === "summary" && (
            <Text as="p" className="request-body">
              {workflow.build?.state === "completed"
                ? workflow.build.summary
                : "The implementation summary appears once Build is complete."}
            </Text>
          )}
        </Column>
      )}
    </>
  );
}
