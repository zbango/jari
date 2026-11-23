import { workflowSectionSources } from "@agent-desktop/shared";
import type { WorkflowSection, WorkflowSectionChange, WorkflowStage } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { ConfirmButton } from "@once-ui-system/core/components/ConfirmButton";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Input } from "@once-ui-system/core/components/Input";
import { Row } from "@once-ui-system/core/components/Row";
import { Select } from "@once-ui-system/core/components/Select";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { workflowError } from "./workflow-error";

export function WorkflowSectionEditor({
  stage,
  sections,
  section,
  onChange,
  onCancel,
}: {
  stage: WorkflowStage;
  sections: WorkflowSection[];
  section?: WorkflowSection;
  onChange(change: WorkflowSectionChange): Promise<void>;
  onCancel(): void;
}) {
  const id = useId();
  const [source, setSource] = useState(section?.source ?? "note");
  const [title, setTitle] = useState(section?.title ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const documents = Object.entries(workflowSectionSources[stage]);
  const options = [
    { value: "note", label: "Note" },
    ...documents.map(([value, label]) => ({
      value,
      label,
      disabled: sections.some((entry) => entry.id !== section?.id && entry.source === value),
    })),
  ];

  async function change(value: WorkflowSectionChange) {
    setSaving(true);
    setError("");
    try {
      await onChange(value);
    } catch (failure) {
      setError(workflowError(failure, "The canvas detail could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const notes = String(new FormData(event.currentTarget).get("notes") ?? "");
    void change({
      action: "save",
      id: section?.id ?? null,
      input: { source, title: title.trim(), notes },
    });
  }

  return (
    <Column as="form" fillWidth gap="12" onSubmit={submit}>
      <Card direction="column" gap="12" padding="16" fillWidth radius="l">
        <Select
          id={`${id}-type`}
          label="Detail type"
          size="s"
          fillWidth
          value={source}
          options={options}
          disabled={saving}
          onValueChange={(value) => {
            if (typeof value !== "string") return;
            if (!title.trim() || title === documents.find(([key]) => key === source)?.[1]) {
              setTitle(documents.find(([key]) => key === value)?.[1] ?? "");
            }
            setSource(value);
          }}
        />
        <Input
          id={`${id}-title`}
          label="Name"
          size="s"
          fillWidth
          focusRing
          required
          value={title}
          onValueChange={setTitle}
          maxLength={80}
          disabled={saving}
        />
        <Textarea
          id={`${id}-notes`}
          name="notes"
          label="Notes"
          size="s"
          lines={4}
          fillWidth
          focusRing
          maxLength={24_000}
          defaultValue={section?.notes}
          disabled={saving}
        />
      </Card>
      <Row gap="8" wrap>
        <Button type="submit" size="s" loading={saving} disabled={saving || !title.trim()}>
          Save detail
        </Button>
        <Button type="button" size="s" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        {section && (
          <ConfirmButton
            type="button"
            size="s"
            variant="tertiary"
            tone="danger"
            label="Remove detail"
            labels={{ confirm: "Confirm removal" }}
            disabled={saving}
            onConfirm={() => void change({ action: "remove", id: section.id })}
          />
        )}
      </Row>
      {error && <Feedback tone="danger" description={error} />}
    </Column>
  );
}
