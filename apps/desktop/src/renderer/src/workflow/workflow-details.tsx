import { maxPlanAnswerLength, workflowProviders } from "@agent-desktop/shared";
import type { WorkflowApi, WorkflowRecord } from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Icon } from "@once-ui-system/core/components/Icon";
import { InlineCode } from "@once-ui-system/core/components/InlineCode";
import { Text } from "@once-ui-system/core/components/Text";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { stages, stageStatus } from "./stages";
import type { Selection } from "./stages";
import { WorkItemPreview } from "./work-item-preview";
import { workflowError } from "./workflow-form";

function PlanReply({ onAnswer }: { onAnswer(answer: string): Promise<void> }) {
  const answerId = useId();
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reply = answer.trim();
    if (!reply || pending) return;
    setPending(true);
    setError("");
    try {
      await onAnswer(reply);
    } catch (failure) {
      setError(workflowError(failure, "Your answer could not be submitted."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Column as="form" gap="8" onSubmit={(event) => void submit(event)}>
      <Textarea
        id={answerId}
        label="Your answers"
        lines={4}
        value={answer}
        maxLength={maxPlanAnswerLength}
        disabled={pending}
        onChange={(event) => setAnswer(event.currentTarget.value)}
      />
      {error && <Feedback tone="danger" description={error} />}
      <Button type="submit" disabled={!answer.trim()} loading={pending} suffixIcon="arrowRight">
        Continue planning
      </Button>
    </Column>
  );
}

export function WorkflowDetails({
  workflow,
  selection,
  retryPlan,
  answerPlan,
  openJiraLink,
}: {
  workflow: WorkflowRecord;
  selection: Selection;
  retryPlan(): Promise<void>;
  answerPlan(answer: string): Promise<void>;
  openJiraLink: WorkflowApi["openJiraLink"];
}) {
  const stage = stages[selection.stage];
  const section = Object.entries(stage.sections).find(([id]) => id === selection.section)?.[1];
  const status = stageStatus(selection.stage, true, workflow.plan);
  const [retryError, setRetryError] = useState("");
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    setRetryError("");
    try {
      await retryPlan();
    } catch (error) {
      setRetryError(workflowError(error, "Planning could not be restarted."));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      {section && <p className="inspector-breadcrumb">{stage.title}</p>}
      <h2>{section ?? stage.title}</h2>
      <span className="workflow-status inspector-status" data-kind={status.kind} role="status">
        <Icon name={status.icon} size="xs" decorative />
        {status.label}
      </span>
      {selection.stage === "idea" && (
        <>
          {!selection.section || selection.section !== "workspace" ? (
            workflow.source ? (
              <WorkItemPreview
                key={workflow.source.key}
                issue={workflow.source}
                openJiraLink={openJiraLink}
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
          {!workflow.plan && <p>No plan has been generated for this workflow.</p>}
          {workflow.plan?.state === "running" && (
            <p>{workflowProviders[workflow.provider]} is preparing a plan.</p>
          )}
          {(workflow.plan?.state === "ready" || workflow.plan?.state === "needs-input") && (
            <>
              <h3>{workflow.plan.state === "ready" ? "Proposed plan" : "Provider questions"}</h3>
              <p className="request-body">{workflow.plan.text}</p>
            </>
          )}
          {workflow.plan?.state === "needs-input" && (
            <PlanReply key={workflow.plan.clarifications?.length ?? 0} onAnswer={answerPlan} />
          )}
          {workflow.plan?.state === "failed" && (
            <p className="form-error">{workflow.plan.message}</p>
          )}
          {workflow.plan?.state === "interrupted" && (
            <p>The previous planning session ended before a result was saved.</p>
          )}
          {(workflow.plan?.state === "failed" || workflow.plan?.state === "interrupted") && (
            <Button
              type="button"
              variant="secondary"
              disabled={retrying}
              onClick={() => void retry()}
            >
              Retry plan
            </Button>
          )}
          {retryError && (
            <p className="form-error" role="alert">
              {retryError}
            </p>
          )}
          {!!workflow.knowledge?.length && (
            <Accordion title="Company Knowledge attached" titleVariant="label-default-s">
              <Column gap="16">
                {workflow.knowledge.map(({ area, title, bodyText, paths }, index) => (
                  <Column key={index} gap="4">
                    <Text textVariant="label-strong-s">
                      {area} · {title}
                    </Text>
                    {bodyText && (
                      <Text as="p" textVariant="body-default-s" className="request-body">
                        {bodyText}
                      </Text>
                    )}
                    {paths.map((path) => (
                      <InlineCode key={path} className="request-body">
                        {path}
                      </InlineCode>
                    ))}
                  </Column>
                ))}
              </Column>
            </Accordion>
          )}
        </div>
      )}
      {selection.stage === "build" && (
        <p className="inspector-description">
          Build requires an approved plan. No execution has started.
        </p>
      )}
    </>
  );
}
