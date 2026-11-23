import {
  milestoneRequiresManualAction,
  nextManualMilestone,
  pendingMilestones,
} from "@agent-desktop/shared";
import type { MilestoneInput, WorkflowMilestone, WorkflowRecord } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Input } from "@once-ui-system/core/components/Input";
import { Row } from "@once-ui-system/core/components/Row";
import { SegmentedControl } from "@once-ui-system/core/components/SegmentedControl";
import { Tab, TabList, TabPanel, Tabs } from "@once-ui-system/core/components/Tabs";
import { Text } from "@once-ui-system/core/components/Text";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { MilestoneInspectorHeader } from "./milestone-inspector-header";
import type { WorkflowStatusKind } from "./stages";
import { workflowError } from "./workflow-error";

export const milestoneTimings = {
  "before-build": "Before Build",
  "after-build": "After Build",
  "follow-up": "Follow-up",
} as const;

const milestoneStatus = {
  ready: { label: "Ready", kind: "waiting", icon: "time" },
  running: { label: "Running", kind: "running", icon: "time" },
  completed: { label: "Completed", kind: "saved", icon: "checkCircle" },
  failed: { label: "Failed", kind: "failed", icon: "warning" },
  interrupted: { label: "Interrupted", kind: "blocked", icon: "pause" },
} as const satisfies Record<
  WorkflowMilestone["state"],
  { label: string; kind: WorkflowStatusKind; icon: string }
>;

export function milestoneDisplayStatus(milestone: WorkflowMilestone, blocked: boolean) {
  if (blocked) return { label: "Waiting", kind: "blocked", icon: "lock" } as const;
  if (milestone.action === "checkpoint" && milestone.state === "ready") {
    return { label: "Awaiting approval", kind: "review", icon: "message" } as const;
  }
  return milestoneStatus[milestone.state];
}

export function milestoneIsBlocked(
  workflow: Pick<WorkflowRecord, "build" | "milestones">,
  milestone: WorkflowMilestone,
) {
  if (milestone.state !== "ready") return false;
  const pending = pendingMilestones(workflow.milestones, milestone.timing);
  if (pending[0]?.id !== milestone.id) return true;
  if (milestone.timing === "before-build") return !workflow.build;
  return (
    workflow.build?.state !== "completed" ||
    (milestone.timing === "follow-up" &&
      pendingMilestones(workflow.milestones, "after-build").length > 0)
  );
}

type Props = {
  workflow: WorkflowRecord;
  milestone?: WorkflowMilestone;
  onSave(input: MilestoneInput): Promise<void>;
  onRun(): Promise<void>;
  onRemove(): Promise<void>;
  onCancel(): void;
};

export function WorkflowMilestoneDetails({
  workflow,
  milestone,
  onSave,
  onRun,
  onRemove,
  onCancel,
}: Props) {
  const [editing, setEditing] = useState(!milestone);
  const [timing, setTiming] = useState<MilestoneInput["timing"]>(milestone?.timing ?? "follow-up");
  const [action, setAction] = useState(milestone?.action ?? "command");
  const [trigger, setTrigger] = useState<"automatic" | "manual">(
    milestone?.action === "checkpoint" ? "automatic" : (milestone?.trigger ?? "automatic"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const executing =
    workflow.build?.state === "running" ||
    workflow.milestones?.some(({ state }) => state === "running");
  const buildStarted =
    workflow.build?.state === "review" ||
    workflow.build?.state === "completed" ||
    workflow.build?.tasks?.some(({ state }) => state === "approved");
  const executionLocked =
    milestone?.state === "completed" ||
    Boolean(milestone?.timing === "before-build" && buildStarted);
  const next = nextManualMilestone(workflow);
  const canRun = !!milestone && next?.id === milestone.id;

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(workflowError(failure, "The milestone could not be updated."));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const args = String(form.get("args") ?? "");
    void act(async () => {
      const properties = {
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        timing,
      };
      if (milestone && executionLocked) {
        await onSave({ ...milestone, ...properties });
      } else if (action === "checkpoint") {
        await onSave({ ...properties, action });
      } else {
        await onSave({
          ...properties,
          action,
          executable: String(form.get("executable") ?? ""),
          args: args ? args.split(/\r?\n/) : [],
          trigger: timing === "follow-up" ? "manual" : trigger,
          timeoutMinutes: Number(form.get("timeout")),
        });
      }
      setEditing(false);
    });
  }

  const status =
    milestone && milestoneDisplayStatus(milestone, milestoneIsBlocked(workflow, milestone));

  const id = useId();
  const executionDisabled = Boolean(executionLocked || busy || executing);
  function showOverview() {
    if (!milestone) return onCancel();
    setAction(milestone.action ?? "command");
    setTiming(milestone.timing);
    setTrigger(
      milestone.action === "checkpoint" ? "automatic" : (milestone.trigger ?? "automatic"),
    );
    setEditing(false);
    setError("");
  }

  const form = (
    <Column as="form" fillWidth gap="12" onSubmit={submit}>
      <Card direction="column" fillWidth padding="16" gap="12" radius="l">
        <Text as="h3" textVariant="heading-strong-xs">
          Details
        </Text>
        <Input
          id={`${id}-name`}
          name="title"
          label="Name"
          size="s"
          fillWidth
          focusRing
          required
          maxLength={80}
          defaultValue={milestone?.title}
          placeholder="Run tests"
        />
        <Textarea
          id={`${id}-description`}
          name="description"
          label="Description"
          size="s"
          lines={2}
          fillWidth
          focusRing
          maxLength={500}
          defaultValue={milestone?.description}
        />
      </Card>
      <Card direction="column" fillWidth padding="16" gap="16" radius="l">
        <Text as="h3" textVariant="heading-strong-xs">
          Execution
        </Text>
        <Column fillWidth gap="8">
          <Text id={`${id}-placement`} textVariant="label-strong-s">
            Placement
          </Text>
          <SegmentedControl
            semantics="radio"
            aria-labelledby={`${id}-placement`}
            compact
            fillWidth
            scroll={false}
            value={timing}
            disabled={executionDisabled}
            buttons={[
              { value: "before-build", label: "Before Build", disabled: buildStarted },
              { value: "after-build", label: "After Build" },
              { value: "follow-up", label: "Follow-up" },
            ]}
            onValueChange={(value) => setTiming(value as MilestoneInput["timing"])}
          />
          <Text textVariant="body-default-s" onBackground="neutral-weak">
            {timing === "before-build"
              ? "Before the first Build task."
              : timing === "after-build"
                ? "After the last Build task is approved."
                : "After Build and its hooks finish."}
          </Text>
        </Column>
        <Column fillWidth gap="8">
          <Text id={`${id}-action`} textVariant="label-strong-s">
            Action
          </Text>
          <SegmentedControl
            semantics="radio"
            aria-labelledby={`${id}-action`}
            compact
            fillWidth
            scroll={false}
            value={action}
            disabled={executionDisabled}
            buttons={[
              { value: "command", label: "Command", prefixIcon: "code" },
              { value: "checkpoint", label: "Checkpoint", prefixIcon: "checkCircle" },
            ]}
            onValueChange={(value) => setAction(value === "checkpoint" ? "checkpoint" : "command")}
          />
        </Column>
        {action === "command" ? (
          <>
            <Column fillWidth gap="8">
              <Text id={`${id}-trigger`} textVariant="label-strong-s">
                Start command
              </Text>
              <SegmentedControl
                semantics="radio"
                aria-labelledby={`${id}-trigger`}
                compact
                fillWidth
                scroll={false}
                value={timing === "follow-up" ? "manual" : trigger}
                disabled={executionDisabled || timing === "follow-up"}
                buttons={[
                  { value: "automatic", label: "Automatic" },
                  { value: "manual", label: "Manual" },
                ]}
                onValueChange={(value) => setTrigger(value === "manual" ? "manual" : "automatic")}
              />
            </Column>
            <Input
              id={`${id}-executable`}
              name="executable"
              label="Executable"
              size="s"
              fillWidth
              focusRing
              disabled={executionDisabled}
              required
              maxLength={1024}
              defaultValue={milestone?.action === "checkpoint" ? undefined : milestone?.executable}
              placeholder="pnpm"
            />
            <Textarea
              id={`${id}-args`}
              name="args"
              label="Arguments, one per line"
              size="s"
              lines={2}
              fillWidth
              focusRing
              disabled={executionDisabled}
              defaultValue={
                milestone?.action === "checkpoint" ? undefined : milestone?.args.join("\n")
              }
              placeholder="test"
            />
            <Input
              id={`${id}-timeout`}
              name="timeout"
              label="Timeout in minutes"
              size="s"
              type="number"
              fillWidth
              focusRing
              disabled={executionDisabled}
              min={1}
              max={120}
              step={1}
              required
              defaultValue={
                milestone?.action === "checkpoint" ? 10 : (milestone?.timeoutMinutes ?? 10)
              }
            />
            <Text textVariant="body-default-s" onBackground="neutral-weak">
              Commands run in this workflow’s workspace. For shell syntax, enter a shell as the
              executable.
            </Text>
          </>
        ) : (
          <Text textVariant="body-default-s" onBackground="neutral-weak">
            The workflow waits for approval at this checkpoint.
          </Text>
        )}
      </Card>
      <Row gap="8" wrap>
        <Button type="submit" size="s" loading={busy} disabled={busy || executing}>
          Save milestone
        </Button>
        <Button type="button" size="s" variant="secondary" onClick={showOverview}>
          Cancel
        </Button>
      </Row>
    </Column>
  );

  const overview = milestone && (
    <Card direction="column" fillWidth padding="16" gap="12" radius="l">
      {milestone.description && <p className="request-body">{milestone.description}</p>}
      {milestone.action !== "checkpoint" && (
        <div>
          <h3>Command</h3>
          <pre className="milestone-output">
            {[milestone.executable, ...milestone.args.map((arg) => JSON.stringify(arg))].join(" ")}
          </pre>
          <p>
            {milestone.trigger === "manual" || milestone.timing === "follow-up"
              ? "Manual start"
              : "Automatic start"}
            {" · "}
            {milestone.timeoutMinutes ?? 10} min timeout
          </p>
        </div>
      )}
      {milestone.message && <p>{milestone.message}</p>}
      {!!milestone.output && (
        <div>
          <h3>Output</h3>
          <pre className="milestone-output" tabIndex={0}>
            {milestone.output}
          </pre>
        </div>
      )}
      {!milestoneRequiresManualAction(milestone) &&
        milestone.timing === "before-build" &&
        milestone.state !== "completed" && <p>Start or retry Build to run this hook.</p>}
      <div className="milestone-actions">
        {canRun && (
          <Button
            type="button"
            size="s"
            disabled={busy || executing}
            onClick={() => void act(onRun)}
          >
            {milestone.action === "checkpoint"
              ? "Approve checkpoint"
              : milestone.state === "failed" || milestone.state === "interrupted"
                ? "Retry command"
                : "Run command"}
          </Button>
        )}
        {!executionLocked && (
          <Button
            type="button"
            size="s"
            variant="tertiary"
            disabled={busy || executing}
            onClick={() => void act(onRemove)}
          >
            Remove
          </Button>
        )}
      </div>
    </Card>
  );

  return (
    <Column fillWidth gap="16">
      <MilestoneInspectorHeader
        title={milestone?.title ?? "Add milestone"}
        caption={
          milestone
            ? `${milestoneTimings[milestone.timing]} · ${milestone.action === "checkpoint" ? "Manual checkpoint" : "Command"}`
            : undefined
        }
        icon={milestone?.action === "checkpoint" ? "checkCircle" : "code"}
        status={status}
      />
      {milestone ? (
        <Tabs
          fillWidth
          gap="16"
          value={editing ? "settings" : "overview"}
          onValueChange={(value) => {
            if (value === "settings") setEditing(true);
            else showOverview();
          }}
        >
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
            <Tab
              value="settings"
              size="s"
              fillWidth
              prefixIcon="settings"
              disabled={busy || executing}
            >
              Settings
            </Tab>
          </TabList>
          <TabPanel value="overview" fillWidth>
            {overview}
          </TabPanel>
          <TabPanel value="settings" fillWidth>
            {form}
          </TabPanel>
        </Tabs>
      ) : (
        form
      )}
      {error && <Feedback tone="danger" description={error} />}
    </Column>
  );
}
