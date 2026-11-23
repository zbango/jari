import { workflowProviders } from "@agent-desktop/shared";
import type {
  ProviderRunMetric,
  ProviderTranscriptEntry,
  WorkflowApi,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ProviderActivity } from "./provider-activity";
import { workflowError } from "./workflow-error";

const messageLabels = {
  instructions: "Provider instructions",
  user: "Prompt sent",
  assistant: "Provider message",
  result: "Provider result",
  session: "Provider session ID",
} satisfies Record<ProviderTranscriptEntry["kind"], string>;

const runStatus = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
} satisfies Record<ProviderRunMetric["status"], string>;

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
          <Row key={run.runId} gap="8" wrap horizontal="between" vertical="center">
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
        ))}
      </Column>
    </Column>
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
  const scrollArea = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

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

  useLayoutEffect(() => {
    const area = scrollArea.current;
    if (area && follow.current) area.scrollTop = area.scrollHeight;
  }, [entries]);

  return (
    <Column id={id} gap="8" fillWidth>
      {live && <ProviderActivity label={`Listening to ${provider}…`} state="listening" />}
      {error && (
        <Feedback tone="danger" description={error}>
          <Button type="button" size="s" variant="secondary" onClick={() => setRetry(retry + 1)}>
            Retry
          </Button>
        </Feedback>
      )}
      {!!runs.length && <ProviderTimings runs={runs} />}
      {!error && entries.length === 0 && (
        <Text textVariant="body-default-s" onBackground="neutral-weak">
          {!loaded
            ? "Loading provider messages…"
            : live
              ? "Waiting for the first message."
              : "This workflow has no recorded provider messages."}
        </Text>
      )}
      {!!entries.length && (
        <Column
          ref={scrollArea}
          role="region"
          aria-label="Provider session messages"
          tabIndex={0}
          fillWidth
          maxHeight="24rem"
          overflowY="auto"
          padding="12"
          gap="12"
          radius="m"
          border="neutral-alpha-weak"
          onScroll={(event) => {
            const area = event.currentTarget;
            follow.current = area.scrollHeight - area.scrollTop - area.clientHeight < 24;
          }}
        >
          {entries.map((entry, index) => {
            const { phase, taskId, attempt, kind, text } = entry;
            const startsRun = entry.runId !== entries[index - 1]?.runId;
            const label = messageLabels[kind];
            const body = (
              <Text as="p" textVariant="body-default-s" className="request-body">
                {text}
              </Text>
            );
            return (
              <Column key={entry.sequence} gap="4" fillWidth>
                {startsRun && (
                  <Text textVariant="label-strong-s">
                    {taskId === null ? phase : `${phase} · Task ${taskId} · Attempt ${attempt}`}
                  </Text>
                )}
                {kind === "assistant" || kind === "result" ? (
                  <>
                    <Text textVariant="label-default-s" onBackground="neutral-weak">
                      {label}
                    </Text>
                    {body}
                  </>
                ) : (
                  <Accordion title={label} titleVariant="label-default-s">
                    {body}
                  </Accordion>
                )}
              </Column>
            );
          })}
        </Column>
      )}
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
}: {
  workflow: WorkflowRecord;
  live: boolean;
  phase?: "Plan" | "Build";
  taskId?: string;
  readTranscript: WorkflowApi["readTranscript"];
  exportTranscript(id: string): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
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
      {open && (
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
      )}
    </Column>
  );
}
