import { workflowProviders } from "@agent-desktop/shared";
import type {
  ProviderRunMetric,
  ProviderTranscriptEntry,
  WorkflowApi,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { ChatMessage, ChatMessageList, TypingIndicator } from "@once-ui-system/core";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Line } from "@once-ui-system/core/components/Line";
import { Row } from "@once-ui-system/core/components/Row";
import { Tag } from "@once-ui-system/core/components/Tag";
import { Text } from "@once-ui-system/core/components/Text";
import { useEffect, useId, useRef, useState } from "react";
import { workflowError } from "./workflow-error";

const runStatus = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
} satisfies Record<ProviderRunMetric["status"], string>;
const tokenCount = new Intl.NumberFormat();

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function ProviderTimings({ runs }: { runs: ProviderRunMetric[] }) {
  const total = runs.reduce((sum, run) => sum + (run.durationMs ?? 0), 0);
  const hasTimings = runs.some(({ durationMs }) => durationMs !== null);
  return (
    <Column role="region" aria-label="Provider call durations" gap="8" fillWidth>
      <Row gap="8" wrap horizontal="between" vertical="center">
        <Text textVariant="label-strong-s">Provider call durations</Text>
        {hasTimings && (
          <Text textVariant="label-default-s" onBackground="neutral-weak">
            Total recorded time {formatDuration(total)}
          </Text>
        )}
      </Row>
      <Column
        maxHeight="12rem"
        overflowY="auto"
        gap="8"
        padding="12"
        radius="m"
        border="neutral-alpha-weak"
      >
        {runs.map((run) => (
          <Column key={run.runId} gap="4" fillWidth>
            <Row gap="8" wrap horizontal="between" vertical="center">
              <Text textVariant="body-default-s">
                {run.taskId === null
                  ? run.phase
                  : `${run.phase} · Task ${run.taskId} · Attempt ${run.attempt}`}
              </Text>
              <Text
                textVariant="label-default-s"
                onBackground={run.status === "failed" ? "danger-strong" : "neutral-weak"}
              >
                {runStatus[run.status]} ·{" "}
                {run.durationMs === null ? "Duration unavailable" : formatDuration(run.durationMs)}
              </Text>
            </Row>
            <Row gap="8" wrap>
              {run.tokens ? (
                <>
                  <Tag size="s" label={`${tokenCount.format(run.tokens.input)} input tokens`} />
                  <Tag size="s" label={`${tokenCount.format(run.tokens.output)} output tokens`} />
                  {!!run.tokens.cacheRead && (
                    <Tag
                      size="s"
                      label={`${tokenCount.format(run.tokens.cacheRead)} cached input tokens`}
                    />
                  )}
                  {!!run.tokens.cacheWrite && (
                    <Tag
                      size="s"
                      label={`${tokenCount.format(run.tokens.cacheWrite)} cache write tokens`}
                    />
                  )}
                  {!!run.tokens.reasoning && (
                    <Tag
                      size="s"
                      label={`${tokenCount.format(run.tokens.reasoning)} reasoning tokens`}
                    />
                  )}
                  {!!run.tokens.contextWindow && (
                    <Tag
                      size="s"
                      label={`${tokenCount.format(run.tokens.contextWindow)} token context window`}
                    />
                  )}
                </>
              ) : (
                <Text textVariant="label-default-s" onBackground="neutral-weak">
                  {run.status === "running" ? "Waiting for token usage" : "Token usage unavailable"}
                </Text>
              )}
            </Row>
          </Column>
        ))}
      </Column>
    </Column>
  );
}

function transcriptMessage(
  { sequence, kind, text, createdAt }: ProviderTranscriptEntry,
  provider: string,
) {
  const body = (
    <Text as="p" textVariant="body-default-s" className="request-body">
      {text}
    </Text>
  );
  if (kind === "instructions" || kind === "session") {
    return (
      <Accordion
        key={sequence}
        title={kind === "instructions" ? "Provider instructions" : "Provider session ID"}
        titleVariant="label-default-s"
      >
        {body}
      </Accordion>
    );
  }

  const outgoing = kind === "user";
  const hasLongPrompt = outgoing && text.length > 400;
  return (
    <ChatMessage
      key={sequence}
      from={outgoing ? "self" : "other"}
      name={outgoing ? "Workflow" : provider}
      time={new Date(createdAt)}
      avatarProps={{ size: "s", icon: outgoing ? "grid" : "code" }}
    >
      {hasLongPrompt ? (
        <Column gap="8">
          <Text as="p" textVariant="body-default-s" className="request-body">
            {text.slice(0, 240).trimEnd()}…
          </Text>
          <Accordion title="Full prompt" titleVariant="label-default-s">
            {body}
          </Accordion>
        </Column>
      ) : kind === "result" ? (
        <Column gap="8">
          <Tag label="Result" size="s" tone="accent" dot={false} />
          {body}
        </Column>
      ) : (
        body
      )}
    </ChatMessage>
  );
}

function MessageFeed({
  id,
  provider,
  workflowId,
  live,
  phase,
  taskId,
  readTranscript,
}: {
  id: string;
  provider: string;
  workflowId: string;
  live: boolean;
  phase?: "Plan" | "Build";
  taskId?: string;
  readTranscript: WorkflowApi["readTranscript"];
}) {
  const [entries, setEntries] = useState<ProviderTranscriptEntry[]>([]);
  const [runs, setRuns] = useState<ProviderRunMetric[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const cursor = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const matches = (item: Pick<ProviderTranscriptEntry, "phase" | "taskId">) =>
          (!phase || (phase === "Plan" ? item.phase !== "Build" : item.phase === "Build")) &&
          (!taskId || item.taskId === taskId);
        let hasMore: boolean;
        do {
          const page = await readTranscript(workflowId, cursor.current);
          if (!active) return;
          setRuns(page.runs.filter(matches));
          const last = page.entries.at(-1);
          if (last) {
            cursor.current = last.sequence;
            const selected = page.entries.filter(matches);
            if (selected.length) setEntries((previous) => [...previous, ...selected]);
          }
          hasMore = page.hasMore;
        } while (hasMore);
        setError("");
      } catch (failure) {
        if (active) setError(workflowError(failure, "Provider messages could not be loaded."));
      }
      if (active) {
        setLoaded(true);
        if (live) timer = setTimeout(() => void refresh(), 750);
      }
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [live, phase, readTranscript, retry, taskId, workflowId]);

  return (
    <Column id={id} gap="8" fillWidth>
      {error && (
        <Feedback tone="danger" description={error}>
          <Button type="button" size="s" variant="secondary" onClick={() => setRetry(retry + 1)}>
            Retry
          </Button>
        </Feedback>
      )}
      {!error && !live && entries.length === 0 && (
        <Text textVariant="body-default-s" onBackground="neutral-weak">
          {!loaded
            ? "Loading provider messages…"
            : "This workflow has no recorded provider messages."}
        </Text>
      )}
      {(entries.length > 0 || live) && (
        <ChatMessageList
          aria-label="Provider session messages"
          fillWidth
          fillHeight={false}
          maxHeight="min(54vh, 32rem)"
          padding="12"
          radius="l"
          background="page"
          border
          stack
        >
          {entries.flatMap((entry, index) => {
            const message = transcriptMessage(entry, provider);
            if (entry.runId === entries[index - 1]?.runId) return [message];
            const { phase, taskId, attempt } = entry;
            return [
              <Row key={`run-${entry.sequence}`} gap="8" vertical="center" fillWidth>
                <Line flex={1} />
                <Text textVariant="label-default-s" onBackground="neutral-weak">
                  {taskId === null ? phase : `${phase} · Task ${taskId} · Attempt ${attempt}`}
                </Text>
                <Line flex={1} />
              </Row>,
              message,
            ];
          })}
          {live && (
            <TypingIndicator
              label={
                runs.some(({ status }) => status === "running")
                  ? `${provider} is working…`
                  : "Waiting for provider updates…"
              }
            />
          )}
        </ChatMessageList>
      )}
      {!!runs.length && <ProviderTimings runs={runs} />}
    </Column>
  );
}

export function ProviderMessages({
  workflow,
  live,
  phase,
  taskId,
  readTranscript,
  exportTranscript,
  inInspector = false,
}: {
  workflow: WorkflowRecord;
  live: boolean;
  phase?: "Plan" | "Build";
  taskId?: string;
  readTranscript: WorkflowApi["readTranscript"];
  exportTranscript(id: string): Promise<void>;
  inInspector?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const feed = (open || inInspector) && (
    <MessageFeed
      key={`${workflow.id}:${phase ?? ""}:${taskId ?? ""}`}
      id={id}
      provider={workflowProviders[workflow.provider]}
      workflowId={workflow.id}
      live={live}
      phase={phase}
      taskId={taskId}
      readTranscript={readTranscript}
    />
  );
  if (inInspector) {
    return (
      <Card fillWidth direction="column" padding="16" gap="16" radius="l">
        <Row fillWidth gap="8" horizontal="between" vertical="center" wrap>
          <Text as="h3" textVariant="heading-strong-xs">
            Provider messages
          </Text>
          <Button
            type="button"
            size="s"
            variant="secondary"
            prefixIcon="download"
            onClick={() => void exportTranscript(workflow.id)}
          >
            Export provider transcript
          </Button>
        </Row>
        {feed}
      </Card>
    );
  }
  return (
    <Column gap="8" fillWidth>
      <Row gap="8" wrap>
        <Button
          type="button"
          variant="secondary"
          size="s"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide live messages" : "View live messages"}
        </Button>
        <Button
          type="button"
          variant="tertiary"
          size="s"
          onClick={() => void exportTranscript(workflow.id)}
        >
          Export provider transcript
        </Button>
      </Row>
      {feed}
    </Column>
  );
}
