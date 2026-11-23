import type { WorkflowStageSettings } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Input } from "@once-ui-system/core/components/Input";
import { Row } from "@once-ui-system/core/components/Row";
import { SegmentedControl } from "@once-ui-system/core/components/SegmentedControl";
import { Text } from "@once-ui-system/core/components/Text";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { stages } from "./stages";
import type { Stage } from "./stages";
import { workflowError } from "./workflow-error";

const actions: Record<Stage, string> = {
  idea: "Capture the request and workspace",
  plan: "Generate a plan and request approval",
  build: "Implement tasks and request review",
};

export function StageMilestoneSettings({
  stage,
  settings,
  onSave,
  onCancel,
}: {
  stage: Stage;
  settings?: Partial<WorkflowStageSettings>;
  onSave(settings: WorkflowStageSettings): Promise<void>;
  onCancel(): void;
}) {
  const id = useId();
  const [expandDetails, setExpandDetails] = useState<WorkflowStageSettings["expandDetails"]>(
    settings?.expandDetails ?? "default",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: String(fields.get("title") ?? ""),
        description: String(fields.get("description") ?? ""),
        expandDetails,
      });
    } catch (failure) {
      setError(workflowError(failure, "The milestone settings could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Column as="form" gap="12" fillWidth onSubmit={(event) => void submit(event)}>
      <Card direction="column" fillWidth padding="16" gap="16" radius="l">
        <Column gap="4">
          <Text as="h3" textVariant="heading-strong-xs">
            Canvas appearance
          </Text>
          <Text textVariant="body-default-s" onBackground="neutral-weak">
            {actions[stage]}
          </Text>
        </Column>
        <Input
          id={`${id}-title`}
          name="title"
          label="Name"
          size="s"
          fillWidth
          focusRing
          required
          maxLength={80}
          defaultValue={settings?.title ?? stages[stage].title}
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
          defaultValue={settings?.description ?? stages[stage].description}
        />
        <Column gap="8" fillWidth>
          <Text id={`${id}-expansion`} textVariant="label-strong-s">
            Default canvas details
          </Text>
          <SegmentedControl
            semantics="radio"
            aria-labelledby={`${id}-expansion`}
            compact
            scroll={false}
            fillWidth
            buttons={[
              { value: "default", label: "Default" },
              { value: "expanded", label: "Expanded" },
              { value: "collapsed", label: "Collapsed" },
            ]}
            value={expandDetails}
            onValueChange={(value) =>
              setExpandDetails(value as WorkflowStageSettings["expandDetails"])
            }
          />
        </Column>
      </Card>
      {error && <Feedback tone="danger" description={error} />}
      <Row gap="8" wrap>
        <Button type="submit" size="s" loading={saving} disabled={saving}>
          Save milestone
        </Button>
        <Button type="button" size="s" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </Row>
    </Column>
  );
}
