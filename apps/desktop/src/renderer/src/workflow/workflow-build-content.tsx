import { maxPlanAnswerLength } from "@agent-desktop/shared";
import type {
  BuildTaskReviewInput,
  WorkflowBuildTask,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Input } from "@once-ui-system/core/components/Input";
import { InlineCode } from "@once-ui-system/core/components/InlineCode";
import { Row } from "@once-ui-system/core/components/Row";
import { StatusIndicator } from "@once-ui-system/core/components/StatusIndicator";
import { Text } from "@once-ui-system/core/components/Text";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { useId, useState } from "react";
import { buildTaskStatus } from "./stages";
import { workflowError } from "./workflow-error";

function BuildTaskDetail({
  task,
  reviewTask,
}: {
  task: WorkflowBuildTask;
  reviewTask(input: BuildTaskReviewInput): Promise<void>;
}) {
  const feedbackId = useId();
  const commitSubjectId = useId();
  const gitReview = task.git?.review;
  const [editedSubject, setEditedSubject] = useState<string>();
  const commitSubject = editedSubject ?? gitReview?.subject ?? "";
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function review(changes?: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await reviewTask({
        taskId: task.id,
        attempt: task.attempt,
        ...(changes ? { feedback: changes } : {}),
        ...(!changes && gitReview?.files.length ? { commitSubject } : {}),
      });
    } catch (failure) {
      setError(workflowError(failure, "Task review could not be saved."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Column gap="12">
      <Column gap="4">
        <Heading as="h3" textVariant="heading-strong-s">
          {task.id}. {task.title}
        </Heading>
        <Text textVariant="label-default-s" onBackground="neutral-weak">
          {buildTaskStatus[task.state].label}
        </Text>
        <Text as="p" className="request-body">
          {task.detail}
        </Text>
      </Column>
      {!!task.files.length && (
        <Column gap="4">
          <Text textVariant="label-strong-s">Planned files</Text>
          {task.files.map((path, index) => (
            <InlineCode key={index} className="request-body">
              {path}
            </InlineCode>
          ))}
        </Column>
      )}
      {task.state === "running" && (
        <Row role="status" gap="8" vertical="center">
          <StatusIndicator pulse size="s" tone="brand" />
          <Text>
            {task.revisions.length
              ? "The provider is revising this task."
              : "The provider is implementing this task."}
          </Text>
        </Row>
      )}
      {task.summary && (
        <Column gap="4">
          <Text textVariant="label-strong-s">Implementation summary</Text>
          <Text as="p" className="request-body">
            {task.summary}
          </Text>
        </Column>
      )}
      {task.git?.commit && (
        <Column gap="4">
          <Text textVariant="label-strong-s">Git commit</Text>
          <InlineCode className="request-body">
            {task.git.commit.hash.slice(0, 12)} {task.git.commit.subject}
          </InlineCode>
        </Column>
      )}
      {task.state === "review" && (
        <Column gap="8">
          <Text as="p" textVariant="body-default-s" onBackground="neutral-weak">
            {gitReview?.files.length
              ? "Approval commits the reviewed files to the current branch and advances Build."
              : gitReview
                ? "This task has no file changes to commit. Approval advances Build."
                : "This task needs a Git snapshot before its changes can be committed."}
          </Text>
          {!!gitReview?.files.length && (
            <Column gap="8">
              <Accordion title={`Files to commit (${gitReview.files.length})`} defaultOpen>
                {gitReview.files.map((path) => (
                  <InlineCode key={path} className="request-body">
                    {path}
                  </InlineCode>
                ))}
              </Accordion>
              {!editing && (
                <Input
                  id={commitSubjectId}
                  label="Commit subject"
                  size="s"
                  value={commitSubject}
                  maxLength={120}
                  disabled={pending}
                  onChange={(event) => setEditedSubject(event.currentTarget.value)}
                />
              )}
            </Column>
          )}
          {editing ? (
            <Column
              as="form"
              gap="8"
              onSubmit={(event) => {
                event.preventDefault();
                if (feedback.trim()) void review(feedback.trim());
              }}
            >
              <Textarea
                id={feedbackId}
                label="Requested changes"
                lines={4}
                value={feedback}
                maxLength={maxPlanAnswerLength}
                disabled={pending}
                onChange={(event) => setFeedback(event.currentTarget.value)}
              />
              <Row gap="8" wrap>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={pending} disabled={pending || !feedback.trim()}>
                  Send changes
                </Button>
              </Row>
            </Column>
          ) : (
            <Row gap="8" wrap>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setEditing(true)}
              >
                Request changes
              </Button>
              <Button
                type="button"
                loading={pending}
                disabled={pending || (!!gitReview?.files.length && !commitSubject.trim())}
                onClick={() => void review()}
              >
                Approve task
              </Button>
            </Row>
          )}
          {error && <Feedback tone="danger" description={error} />}
        </Column>
      )}
      {!!task.revisions.length && (
        <Accordion title="Review history" titleVariant="label-default-s">
          <Column gap="12">
            {task.revisions.map(({ feedback: request, summary }, index) => (
              <Column key={index} gap="4">
                <Text textVariant="label-strong-s">Revision {index + 1}</Text>
                <Text as="p" className="request-body">
                  {summary}
                </Text>
                <Text as="p" className="request-body" onBackground="neutral-weak">
                  {request}
                </Text>
              </Column>
            ))}
          </Column>
        </Accordion>
      )}
    </Column>
  );
}

export function WorkflowBuildContent({
  workflow,
  taskId,
  openPlanReview,
  startBuild,
  reviewTask,
}: {
  workflow: WorkflowRecord;
  taskId?: string;
  openPlanReview(): void;
  startBuild(): Promise<void>;
  reviewTask(input: BuildTaskReviewInput): Promise<void>;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const { build, workspacePath } = workflow;

  async function start() {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      await startBuild();
    } catch (failure) {
      setError(workflowError(failure, "Build could not be started."));
    } finally {
      setStarting(false);
    }
  }

  if (!build)
    return (
      <Column gap="8">
        <Text as="p">Build requires an approved plan. No execution has started.</Text>
        {workflow.plan?.state === "ready" && (
          <Button type="button" variant="secondary" onClick={openPlanReview}>
            Review plan
          </Button>
        )}
      </Column>
    );

  const tasks = build.tasks ?? [];
  const active = tasks.find(({ state }) => state !== "approved");
  const selected = tasks.find(({ id }) => id === taskId) ?? active ?? tasks.at(-1);
  const showStart =
    build.state === "ready" || build.state === "failed" || build.state === "interrupted";

  return (
    <Column gap="12">
      <Text textVariant="label-strong-s">Workspace</Text>
      <InlineCode className="request-body">{workspacePath}</InlineCode>
      {!!tasks.length && (
        <Text textVariant="body-default-s" onBackground="neutral-weak">
          {tasks.filter(({ state }) => state === "approved").length} of {tasks.length} tasks
          approved
        </Text>
      )}
      {build.state === "completed" && (
        <Text as="p" className="request-body">
          {build.summary}
        </Text>
      )}
      {selected && (
        <BuildTaskDetail
          key={`${selected.id}:${selected.attempt}`}
          task={selected}
          reviewTask={reviewTask}
        />
      )}
      {showStart && (!selected || selected.id === active?.id) && (
        <>
          {build.state === "failed" && <Feedback tone="danger" description={build.message} />}
          {build.state === "interrupted" && (
            <Feedback
              tone="warning"
              description="The build was interrupted. The workspace may contain partial changes."
            />
          )}
          <Text as="p">
            {build.state === "ready"
              ? "Starting Build lets the selected provider edit files in this workspace."
              : "Retrying continues the current task using the files already in the workspace."}
          </Text>
          <Button
            type="button"
            prefixIcon="code"
            loading={starting}
            disabled={starting}
            onClick={() => void start()}
          >
            {build.state === "ready" ? "Start Build" : "Retry task"}
          </Button>
        </>
      )}
      {error && <Feedback tone="danger" description={error} />}
    </Column>
  );
}
