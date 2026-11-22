import type { KnowledgeNote, KnowledgeNoteInput } from "@agent-desktop/shared";
import { useToast } from "@once-ui-system/core";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { ConfirmButton } from "@once-ui-system/core/components/ConfirmButton";
import { Dialog } from "@once-ui-system/core/components/Dialog";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { InlineCode } from "@once-ui-system/core/components/InlineCode";
import { Input } from "@once-ui-system/core/components/Input";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { RichTextEditor } from "@once-ui-system/core/richtext";
import { useState } from "react";
import type { FormEvent } from "react";
import { workflowError } from "./workflow/workflow-form";

export function KnowledgeNoteDialog({
  note,
  area,
  onClose,
  onSave,
  onRemove,
}: {
  note: KnowledgeNote | null;
  area: string;
  onClose(): void;
  onSave(id: string | null, input: KnowledgeNoteInput): Promise<void>;
  onRemove(id: string): Promise<void>;
}) {
  const { addToast } = useToast();
  const [editing, setEditing] = useState(!note);
  const [title, setTitle] = useState(note?.title ?? "");
  const [noteArea, setNoteArea] = useState(note?.area ?? area);
  const [bodyHtml, setBodyHtml] = useState(note?.bodyHtml ?? "");
  const [paths, setPaths] = useState(note?.paths.join("\n") ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    if (!note) {
      onClose();
      return;
    }
    setTitle(note.title);
    setNoteArea(note.area);
    setBodyHtml(note.bodyHtml);
    setPaths(note.paths.join("\n"));
    setError("");
    setEditing(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await onSave(note?.id ?? null, {
        area: noteArea,
        title,
        bodyHtml,
        paths: paths.split(/\r?\n/),
      });
      onClose();
      addToast({
        tone: "success",
        message: note ? "Knowledge note updated" : "Knowledge note created",
      });
    } catch (failure) {
      setError(workflowError(failure, "The note could not be saved."));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!note || pending) return;
    setPending(true);
    setError("");
    try {
      await onRemove(note.id);
      onClose();
      addToast({ tone: "success", message: "Knowledge note deleted" });
    } catch (failure) {
      setError(workflowError(failure, "The note could not be deleted."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={editing ? (note ? "Edit knowledge note" : "New knowledge note") : note?.title}
      closeOnClickaway={!editing && !pending}
      maxWidth="44rem"
      footer={
        // Keep the Edit click from activating a reused Save button.
        editing ? (
          <Row key="edit-actions" gap="8" wrap horizontal="end">
            <Button type="button" variant="secondary" disabled={pending} onClick={reset}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="knowledge-note-form"
              disabled={!noteArea.trim() || !title.trim()}
              loading={pending}
            >
              Save note
            </Button>
          </Row>
        ) : (
          <Row key="view-actions" fillWidth gap="8" wrap horizontal="between">
            <ConfirmButton
              type="button"
              label="Delete note"
              labels={{ confirm: "Permanently delete" }}
              tone="danger"
              variant="tertiary"
              disabled={pending}
              onConfirm={() => void remove()}
            />
            <Button
              type="button"
              prefixIcon="edit"
              disabled={pending}
              onClick={() => {
                setError("");
                setEditing(true);
              }}
            >
              Edit note
            </Button>
          </Row>
        )
      }
    >
      <Column as="form" id="knowledge-note-form" gap="16" onSubmit={(event) => void save(event)}>
        {editing ? (
          <>
            <Input
              id="knowledge-area"
              label="Area"
              value={noteArea}
              onChange={(event) => setNoteArea(event.currentTarget.value)}
              required
              disabled={pending}
            />
            <Input
              id="knowledge-title"
              label="Note title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              required
              autoFocus
              disabled={pending}
            />
          </>
        ) : (
          <Text textVariant="label-default-s" onBackground="neutral-weak">
            {note?.area}
          </Text>
        )}
        <RichTextEditor
          label="Note"
          value={bodyHtml}
          onValueChange={setBodyHtml}
          readOnly={!editing}
          disabled={pending}
          placeholder="Add background, business rules, or implementation details"
          minHeight="8rem"
          maxHeight="16rem"
        />
        {editing ? (
          <Textarea
            id="knowledge-paths"
            label="Relevant file paths"
            description="Enter one path per line, relative to the workspace when possible."
            value={paths}
            onChange={(event) => setPaths(event.currentTarget.value)}
            placeholder="src/finance/ledger.ts"
            lines={4}
            disabled={pending}
          />
        ) : note?.paths.length ? (
          <Column gap="8">
            <Text textVariant="label-strong-s">Relevant file paths</Text>
            {note.paths.map((path) => (
              <InlineCode key={path} className="request-body">
                {path}
              </InlineCode>
            ))}
          </Column>
        ) : null}
        {error && <Feedback tone="danger" description={error} />}
      </Column>
    </Dialog>
  );
}
