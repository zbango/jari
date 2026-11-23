import { workflowProviders, workflowSections } from "@agent-desktop/shared";
import type {
  BuildTaskReviewInput,
  WorkflowApi,
  WorkflowRecord,
  WorkflowSectionChange,
  WorkflowStageSettings,
} from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { Icon } from "@once-ui-system/core/components/Icon";
import { InlineCode } from "@once-ui-system/core/components/InlineCode";
import { Row } from "@once-ui-system/core/components/Row";
import { Tab, TabList, TabPanel, Tabs } from "@once-ui-system/core/components/Tabs";
import { Text } from "@once-ui-system/core/components/Text";
import { useState } from "react";
import { MilestoneInspectorHeader } from "./milestone-inspector-header";
import { PlanSteps, PlannedFileChanges, ReviewList } from "./plan-review-sections";
import { ProviderMessages } from "./provider-messages";
import { buildTaskStatus, stages, stageStatus } from "./stages";
import { StageMilestoneSettings } from "./stage-milestone-settings";
import type { Selection } from "./stages";
import { WorkItemPreview } from "./work-item-preview";
import { WorkflowBuildContent } from "./workflow-build-content";
import { WorkflowKnowledge, WorkflowPlanContent } from "./workflow-plan-content";
import { WorkflowSectionEditor } from "./workflow-section-editor";

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
  saveStageSettings,
  openMilestone,
  editSection,
  closeSection,
  openBuildTask,
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
  saveStageSettings(settings: WorkflowStageSettings): Promise<void>;
  openMilestone(id: string): void;
  editSection(change: WorkflowSectionChange): Promise<void>;
  closeSection(): void;
  openBuildTask(id: string): void;
}) {
  const stage = stages[selection.stage];
  const settings = workflow.stageSettings?.[selection.stage];
  const title = settings?.title ?? stage.title;
  const sections = workflowSections(selection.stage, workflow.stageSettings);
  const section = sections.find(({ id }) => id === selection.section);
  const source = section?.source;
  const task = workflow.build?.tasks?.find(({ id }) => id === selection.taskId);
  const status = task
    ? buildTaskStatus[task.state]
    : stageStatus(selection.stage, true, workflow.plan, workflow.build);
  const review = workflow.plan?.state === "ready" ? workflow.plan.review : undefined;
  const overview = !source || source === "approvals" || source === "activity" || task;
  const providerLive = task
    ? task.state === "running"
    : selection.stage === "plan"
      ? workflow.plan?.state === "running" ||
        (workflow.plan?.state === "ready" && workflow.plan.reviewAttempt?.state === "running")
      : workflow.build?.state === "running";
  const canConfigure = !task && !selection.queue;
  const hasActivity = selection.stage !== "idea";
  const [tab, setTab] = useState(source === "activity" && hasActivity ? "activity" : "overview");
  if (selection.section === "new") {
    return (
      <Column fillWidth gap="16">
        <MilestoneInspectorHeader title="Add detail" caption={title} icon="document" />
        <WorkflowSectionEditor
          stage={selection.stage}
          sections={sections}
          onChange={editSection}
          onCancel={closeSection}
        />
      </Column>
    );
  }
  if (selection.queue) {
    const tasks = workflow.build?.tasks ?? [];
    return (
      <Column fillWidth gap="12">
        <MilestoneInspectorHeader
          title="Task queue"
          caption={title}
          icon="layers"
          status={status}
        />
        <Text textVariant="body-default-s" onBackground="neutral-weak">
          {tasks.filter(({ state }) => state === "approved").length} of {tasks.length} tasks
          approved
        </Text>
        {tasks.map((entry) => {
          const taskStatus = buildTaskStatus[entry.state];
          return (
            <Card
              key={entry.id}
              fillWidth
              gap="8"
              wrap
              padding="12"
              radius="m"
              tint="brand"
              horizontal="between"
              vertical="center"
              aria-label={`Open task ${entry.id}: ${entry.title}`}
              onClick={() => openBuildTask(entry.id)}
            >
              <Text textVariant="body-default-s">
                {entry.id}. {entry.title}
              </Text>
              <Row
                gap="4"
                vertical="center"
                className="workflow-status"
                data-kind={taskStatus.kind}
              >
                <Icon name={taskStatus.icon} size="xs" decorative />
                {taskStatus.label}
              </Row>
            </Card>
          );
        })}
      </Column>
    );
  }
  const content = (
    <>
      {section?.notes && (
        <Column gap="8" className="inspector-field">
          {source !== "note" && (
            <Text as="h3" textVariant="heading-strong-xs">
              Notes
            </Text>
          )}
          <Text as="p" className="request-body">
            {section.notes}
          </Text>
        </Column>
      )}
      {source === "note" && !section?.notes && (
        <Text as="p" onBackground="neutral-weak">
          Add notes in Settings.
        </Text>
      )}
      {source !== "note" && (
        <>
          {selection.stage === "idea" && (
            <>
              {(!source || source === "request") &&
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
              {(!source || source === "workspace") && <WorkspaceDetails workflow={workflow} />}
              {source === "context" && <ContextDetails workflow={workflow} />}
            </>
          )}
          {selection.stage === "plan" && (
            <div className="inspector-field">
              {workflow.plan && (
                <Button type="button" variant="secondary" onClick={openPlanReview}>
                  Open plan review
                </Button>
              )}
              {source ? (
                <PlanSection section={source} workflow={workflow} />
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
              openMilestone={openMilestone}
            />
          )}
          {selection.stage === "build" && !overview && (
            <Column gap="12" className="inspector-field">
              {source === "worktree" && <WorkspaceDetails workflow={workflow} />}
              {source === "tasks" &&
                (review?.steps.length ? (
                  <PlanSteps steps={review.steps} />
                ) : (
                  <Text>No implementation steps have been recorded.</Text>
                ))}
              {source === "files" &&
                (review?.files.length ? (
                  <PlannedFileChanges files={review.files} />
                ) : (
                  <Text>No proposed file changes have been recorded.</Text>
                ))}
              {source === "tools" && <PlanningSettings workflow={workflow} />}
              {source === "summary" && (
                <Text as="p" className="request-body">
                  {workflow.build?.state === "completed"
                    ? workflow.build.summary
                    : "The implementation summary appears once Build is complete."}
                </Text>
              )}
            </Column>
          )}
        </>
      )}
    </>
  );
  return (
    <Column fillWidth gap="16">
      <MilestoneInspectorHeader
        title={task ? `${task.id}. ${task.title}` : (section?.title ?? title)}
        caption={section || task ? title : undefined}
        icon={stage.icon}
        status={status}
      />
      {canConfigure || hasActivity ? (
        <Tabs fillWidth gap="16" value={tab} onValueChange={setTab}>
          <TabList
            aria-label="Milestone options"
            fillWidth
            gap="4"
            padding="4"
            radius="m"
            border="neutral-alpha-weak"
          >
            <Tab value="overview" size="s" fillWidth prefixIcon="layers">
              Overview
            </Tab>
            {hasActivity && (
              <Tab value="activity" size="s" fillWidth prefixIcon="message">
                Activity
              </Tab>
            )}
            {canConfigure && (
              <Tab value="settings" size="s" fillWidth prefixIcon="settings">
                Settings
              </Tab>
            )}
          </TabList>
          <TabPanel value="overview" fillWidth>
            {content}
          </TabPanel>
          {hasActivity && (
            <TabPanel value="activity" fillWidth>
              <ProviderMessages
                inInspector
                workflow={workflow}
                live={providerLive}
                readTranscript={readTranscript}
                exportTranscript={exportTranscript}
                phase={selection.stage === "plan" ? "Plan" : "Build"}
                taskId={task?.id}
              />
            </TabPanel>
          )}
          {canConfigure && (
            <TabPanel value="settings" fillWidth>
              {section ? (
                <WorkflowSectionEditor
                  stage={selection.stage}
                  sections={sections}
                  section={section}
                  onChange={async (change) => {
                    await editSection(change);
                    setTab("overview");
                  }}
                  onCancel={() => setTab("overview")}
                />
              ) : (
                <StageMilestoneSettings
                  stage={selection.stage}
                  settings={settings}
                  onSave={async (input) => {
                    await saveStageSettings(input);
                    setTab("overview");
                  }}
                  onCancel={() => setTab("overview")}
                />
              )}
            </TabPanel>
          )}
        </Tabs>
      ) : (
        content
      )}
    </Column>
  );
}
