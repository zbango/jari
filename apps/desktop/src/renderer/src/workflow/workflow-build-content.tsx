import { maxPlanAnswerLength, nextManualMilestone } from "@agent-desktop/shared";
import type {
  BuildTaskReviewInput,
  WorkflowApi,
  WorkflowBuildTask,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Dialog } from "@once-ui-system/core/components/Dialog";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Input } from "@once-ui-system/core/components/Input";
import { InlineCode } from "@once-ui-system/core/components/InlineCode";
import { Row } from "@once-ui-system/core/components/Row";
import { StatusIndicator } from "@once-ui-system/core/components/StatusIndicator";
import { Text } from "@once-ui-system/core/components/Text";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { useEffect, useId, useState } from "react";
import { CodeDiff } from "./code-diff";
import { ProviderActivity } from "./provider-activity";
import { buildTaskStatus } from "./stages";
import { workflowError } from "./workflow-error";

function CommitFileDialog({
  workflowId,
  taskId,
  path,
  commit,
  readDiff,
  onClose,
}: {
  workflowId: string;
  taskId: string;
  path: string;
  commit: { hash: string; subject: string };
  readDiff: WorkflowApi["readBuildCommitDiff"];
  onClose(): void;
}) {
  const [diff, setDiff] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void readDiff(workflowId, taskId, path).then(
      (value) => {
        if (active) setDiff(value);
      },
      (failure: unknown) => {
        if (active) setError(workflowError(failure, "The committed diff could not be loaded."));
      },
    );
    return () => {
      active = false;
    };
  }, [path, readDiff, taskId, workflowId]);

  return (
    <Dialog
      open
      title="Committed file changes"
      description={`${commit.hash.slice(0, 12)} · ${commit.subject}`}
      maxWidth="58rem"
      onClose={onClose}
    >
      <Column gap="12">
        <InlineCode className="request-body">{path}</InlineCode>
        {error ? (
          <Feedback tone="danger" description={error} />
        ) : diff === undefined ? (
          <Row role="status" gap="8" vertical="center">
            <StatusIndicator pulse size="s" tone="brand" />
            <Text>Loading committed changes…</Text>
          </Row>
        ) : diff ? (
          <CodeDiff diff={diff} path={path} label="Commit diff" />
        ) : (
          <Text>Git returned no changes for this file in the commit.</Text>
        )}
      </Column>
    </Dialog>
  );
}

function BuildTaskDetail({
  task,
  workflowId,
  reviewTask,
  readCommitDiff,
  showHeading,
}: {
  task: WorkflowBuildTask;
  workflowId: string;
  reviewTask(input: BuildTaskReviewInput): Promise<void>;
  readCommitDiff: WorkflowApi["readBuildCommitDiff"];
  showHeading: boolean;
}) {
  const feedbackId = useId();
  const commitSubjectId = useId();
  const gitReview = task.git?.review;
  const commit = task.git?.commit;
  const [selectedFile, setSelectedFile] = useState<string>();
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
        {showHeading && (
          <>
            <Heading as="h3" textVariant="heading-strong-s">
              {task.id}. {task.title}
            </Heading>
            <Text textVariant="label-default-s" onBackground="neutral-weak">
              {buildTaskStatus[task.state].label}
            </Text>
          </>
        )}
        {task.attempt > 0 && (
          <Text textVariant="label-default-s" onBackground="neutral-weak">
            Attempt {task.attempt}
          </Text>
        )}
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
        <ProviderActivity
          label={
            task.revisions.length
              ? "The provider is revising this task."
              : "The provider is implementing this task."
          }
        />
      )}
      {task.summary && (
        <Column gap="4">
          <Text textVariant="label-strong-s">Implementation summary</Text>
          <Text as="p" className="request-body">
            {task.summary}
          </Text>
        </Column>
      )}
      {commit && (
        <Column gap="4">
          <Text textVariant="label-strong-s">Git commit</Text>
          <InlineCode className="request-body">
            {commit.hash.slice(0, 12)} {commit.subject}
          </InlineCode>
        </Column>
      )}
      {commit && !!gitReview?.files.length && (
        <Accordion title={`Changed files (${gitReview.files.length})`}>
          {gitReview.files.map((path) => (
            <Button
              key={path}
              type="button"
              variant="tertiary"
              size="s"
              aria-haspopup="dialog"
              suffixIcon="arrowRight"
              onClick={() => setSelectedFile(path)}
            >
              <InlineCode className="request-body">{path}</InlineCode>
            </Button>
          ))}
        </Accordion>
      )}
      {commit && selectedFile && (
        <CommitFileDialog
          workflowId={workflowId}
          taskId={task.id}
          path={selectedFile}
          commit={commit}
          readDiff={readCommitDiff}
          onClose={() => setSelectedFile(undefined)}
        />
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
  readCommitDiff,
  openMilestone,
}: {
  workflow: WorkflowRecord;
  taskId?: string;
  openPlanReview(): void;
  startBuild(commitBaseline?: boolean): Promise<void>;
  reviewTask(input: BuildTaskReviewInput): Promise<void>;
  readCommitDiff: WorkflowApi["readBuildCommitDiff"];
  openMilestone(id: string): void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const { build, workspacePath } = workflow;
  const baselineFiles = build?.state === "failed" ? build.baselineFiles : undefined;

  async function start() {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      await startBuild(baselineFiles?.length ? true : undefined);
    } catch (failure) {
      setError(workflowError(failure, "Build could not be started."));
    } finally {
      setStarting(false);
    }
  }

  if (!build)
    return (
      <Feedback
        tone="warning"
        role="note"
        aria-live="off"
        icon="lock"
        title="Plan approval required"
        description="Build requires an approved plan. No execution has started."
      >
        {workflow.plan?.state === "ready" && (
          <Button type="button" size="s" suffixIcon="arrowRight" onClick={openPlanReview}>
            Review plan
          </Button>
        )}
      </Feedback>
    );

  const tasks = build.tasks ?? [];
  const active = tasks.find(({ state }) => state !== "approved");
  const selected = tasks.find(({ id }) => id === taskId) ?? active ?? tasks.at(-1);
  const showStart =
    build.state === "ready" || build.state === "failed" || build.state === "interrupted";
  const waiting = showStart ? nextManualMilestone(workflow) : undefined;

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
      {build.state === "completed" && !taskId && (
        <Text as="p" className="request-body">
          {build.summary}
        </Text>
      )}
      {selected && (
        <BuildTaskDetail
          key={`${selected.id}:${selected.attempt}`}
          task={selected}
          workflowId={workflow.id}
          reviewTask={reviewTask}
          readCommitDiff={readCommitDiff}
          showHeading={!taskId}
        />
      )}
      {waiting && (
        <Feedback tone="warning" description={`Complete ${waiting.title} before starting Build.`}>
          <Button type="button" variant="secondary" onClick={() => openMilestone(waiting.id)}>
            Open milestone
          </Button>
        </Feedback>
      )}
      {showStart && !waiting && (!selected || selected.id === active?.id) && (
        <>
          {build.state === "failed" && (
            <Feedback
              tone={baselineFiles?.length ? "warning" : "danger"}
              description={build.message}
            />
          )}
          {build.state === "interrupted" && (
            <Feedback
              tone="warning"
              description="The build was interrupted. The workspace may contain partial changes."
            />
          )}
          {baselineFiles?.length ? (
            <Accordion title={`Files in the initial commit (${baselineFiles.length})`} defaultOpen>
              <Column gap="4" maxHeight="12rem" overflowY="auto">
                {baselineFiles.map((file) => (
                  <InlineCode key={file} className="request-body">
                    {file}
                  </InlineCode>
                ))}
              </Column>
            </Accordion>
          ) : (
            <Text as="p">
              {build.state === "ready"
                ? "Starting Build lets the selected provider edit files in this workspace."
                : "Retrying continues the current task using the files already in the workspace."}
            </Text>
          )}
          <Button
            type="button"
            prefixIcon="code"
            loading={starting}
            disabled={starting}
            onClick={() => void start()}
          >
            {baselineFiles?.length
              ? "Commit existing files and start Build"
              : build.state === "ready"
                ? "Start Build"
                : "Retry task"}
          </Button>
        </>
      )}
      {error && <Feedback tone="danger" description={error} />}
    </Column>
  );
}
