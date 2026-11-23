import { maxPlanAnswerLength, workflowProviders } from "@agent-desktop/shared";
import type { WorkflowRecord } from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Heading } from "@once-ui-system/core/components/Heading";
import { InlineCode } from "@once-ui-system/core/components/InlineCode";
import { Row } from "@once-ui-system/core/components/Row";
import { StatusIndicator } from "@once-ui-system/core/components/StatusIndicator";
import { Text } from "@once-ui-system/core/components/Text";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { PlanReviewSections } from "./plan-review-sections";
import { workflowError } from "./workflow-error";

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

export function WorkflowPlanContent({
  workflow,
  retryPlan,
  answerPlan,
  generateReview,
  detailed = false,
}: {
  workflow: WorkflowRecord;
  retryPlan(): Promise<void>;
  answerPlan(answer: string): Promise<void>;
  generateReview?(): Promise<void>;
  detailed?: boolean;
}) {
  const [retryError, setRetryError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reviewError, setReviewError] = useState("");

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

  async function generate() {
    if (!generateReview || generating) return;
    setGenerating(true);
    setReviewError("");
    try {
      await generateReview();
    } catch (error) {
      setReviewError(workflowError(error, "The structured review could not be started."));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Column gap="16">
      {!workflow.plan && <Text>No plan has been generated for this workflow.</Text>}
      {workflow.plan?.state === "running" && (
        <Row role="status" gap="8" vertical="center">
          {detailed && <StatusIndicator pulse size="s" tone="brand" />}
          <Text>{workflowProviders[workflow.provider]} is preparing a plan.</Text>
        </Row>
      )}
      {detailed &&
        workflow.plan?.state === "ready" &&
        !workflow.plan.review &&
        (workflow.plan.reviewAttempt?.state === "running" || generating ? (
          <Row role="status" gap="8" vertical="center">
            <StatusIndicator pulse size="s" tone="brand" />
            <Text>Preparing the structured review…</Text>
          </Row>
        ) : (
          <Feedback
            tone={
              workflow.plan.reviewAttempt?.state === "failed" || reviewError ? "warning" : "info"
            }
            title="Structured review"
            description={
              reviewError ||
              (workflow.plan.reviewAttempt?.state === "failed"
                ? workflow.plan.reviewAttempt.message
                : "Generate the breakdown, proposed diffs, and verification steps from this saved plan.")
            }
          >
            <Button type="button" variant="secondary" onClick={() => void generate()}>
              Generate structured review
            </Button>
          </Feedback>
        ))}
      {(workflow.plan?.state === "ready" || workflow.plan?.state === "needs-input") && (
        <>
          {detailed && workflow.plan.state === "ready" && workflow.plan.review ? (
            <PlanReviewSections review={workflow.plan.review} text={workflow.plan.text} />
          ) : (
            <Column gap="8">
              <Heading as="h3" textVariant="heading-strong-s">
                {workflow.plan.state === "ready" ? "Proposed plan" : "Provider questions"}
              </Heading>
              <Text as="p" className="request-body">
                {workflow.plan.text}
              </Text>
            </Column>
          )}
        </>
      )}
      {workflow.plan?.state === "needs-input" && (
        <PlanReply key={workflow.plan.clarifications?.length ?? 0} onAnswer={answerPlan} />
      )}
      {workflow.plan?.state === "failed" && (
        <Feedback tone="danger" description={workflow.plan.message} />
      )}
      {workflow.plan?.state === "interrupted" && (
        <Feedback
          tone="warning"
          description="The previous planning session ended before a result was saved."
        />
      )}
      {(workflow.plan?.state === "failed" || workflow.plan?.state === "interrupted") && (
        <Button type="button" variant="secondary" disabled={retrying} onClick={() => void retry()}>
          Retry plan
        </Button>
      )}
      {retryError && <Feedback tone="danger" description={retryError} />}
      {detailed && !!workflow.plan?.clarifications?.length && (
        <Accordion title="Clarification history" titleVariant="label-default-s">
          <Column gap="16">
            {workflow.plan.clarifications.map(({ questions, answer }, index) => (
              <Column gap="4" key={index}>
                <Text textVariant="label-strong-s">Provider questions</Text>
                <Text as="p" className="request-body">
                  {questions}
                </Text>
                <Text textVariant="label-strong-s">Your answers</Text>
                <Text as="p" className="request-body">
                  {answer}
                </Text>
              </Column>
            ))}
          </Column>
        </Accordion>
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
    </Column>
  );
}
