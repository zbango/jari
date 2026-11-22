import { groupKnowledgeNotes } from "@agent-desktop/shared";
import type { KnowledgeApi, KnowledgeNote } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Grid } from "@once-ui-system/core/components/Grid";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Logo } from "@once-ui-system/core/components/Logo";
import { Row } from "@once-ui-system/core/components/Row";
import { Skeleton } from "@once-ui-system/core/components/Skeleton";
import { Text } from "@once-ui-system/core/components/Text";
import { useState } from "react";
import icon from "../../../resources/icon.png?url";
import { KnowledgeNoteDialog } from "./knowledge-note-dialog";

export function KnowledgePage({
  appName,
  notes,
  error,
  onReload,
  onBack,
  onSave,
  onRemove,
}: {
  appName: string;
  notes?: KnowledgeNote[];
  error: string;
  onReload(): void;
  onBack(): void;
  onSave: (...args: Parameters<KnowledgeApi["save"]>) => Promise<void>;
  onRemove: KnowledgeApi["remove"];
}) {
  const [dialog, setDialog] = useState<{ note: KnowledgeNote | null; area: string }>();
  const groups = groupKnowledgeNotes(notes ?? []);

  return (
    <Column minHeight="100dvh" fillWidth background="page">
      <Row
        as="header"
        fillWidth
        background="surface"
        borderBottom
        paddingY="8"
        paddingX="32"
        horizontal="between"
        vertical="center"
        gap="16"
        s={{ paddingX: "16" }}
      >
        <Logo icon={icon} text={appName} />
        <Button type="button" variant="tertiary" prefixIcon="arrowLeft" onClick={onBack}>
          Back to workflows
        </Button>
      </Row>
      <Column
        as="main"
        fillWidth
        horizontal="center"
        paddingX="32"
        paddingY="48"
        s={{ paddingX: "16", paddingY: "24" }}
      >
        <Column maxWidth="64rem" gap="32">
          <Row fillWidth horizontal="between" vertical="center" gap="16" wrap>
            <Heading as="h1" textVariant="display-strong-s">
              Company Knowledge
            </Heading>
            <Button
              type="button"
              prefixIcon="plus"
              disabled={!notes}
              onClick={() => setDialog({ note: null, area: "" })}
            >
              New note
            </Button>
          </Row>
          {error ? (
            <Feedback
              tone="danger"
              title="Company Knowledge could not be loaded"
              description={error}
            >
              <Row>
                <Button type="button" variant="secondary" onClick={onReload}>
                  Retry
                </Button>
              </Row>
            </Feedback>
          ) : !notes ? (
            <Skeleton shape="block" height="104" fillWidth aria-label="Loading Company Knowledge" />
          ) : !groups.size ? (
            <Column padding="24" gap="8" background="surface" border radius="l">
              <Heading as="h2" textVariant="heading-strong-s">
                No notes yet
              </Heading>
              <Text onBackground="neutral-weak" textVariant="body-default-s">
                Create a note and give it an area, such as Finance, to make that area available when
                starting a plan.
              </Text>
            </Column>
          ) : (
            [...groups].map(([area, areaNotes]) => (
              <Column as="section" key={area} gap="16" borderTop paddingTop="24">
                <Row fillWidth horizontal="between" vertical="center" gap="16">
                  <Heading as="h2" textVariant="display-strong-xs">
                    {area}
                  </Heading>
                  <Button
                    type="button"
                    variant="tertiary"
                    prefixIcon="plus"
                    onClick={() => setDialog({ note: null, area })}
                  >
                    Add note
                  </Button>
                </Row>
                <Grid columns={3} m={{ columns: 2 }} s={{ columns: 1 }} gap="16">
                  {areaNotes.map((note) => (
                    <Card
                      key={note.id}
                      fillWidth
                      padding="20"
                      radius="l"
                      background="surface"
                      border
                      onClick={() => setDialog({ note, area })}
                    >
                      <Column gap="8" minWidth="0">
                        <Text textVariant="label-strong-m" className="request-body">
                          {note.title}
                        </Text>
                        {note.bodyText && (
                          <Text
                            textVariant="body-default-s"
                            onBackground="neutral-weak"
                            className="request-body"
                          >
                            {note.bodyText.length > 160
                              ? `${note.bodyText.slice(0, 160).trimEnd()}…`
                              : note.bodyText}
                          </Text>
                        )}
                        {!!note.paths.length && (
                          <Text textVariant="label-default-s" onBackground="neutral-weak">
                            {note.paths.length}{" "}
                            {note.paths.length === 1 ? "file path" : "file paths"}
                          </Text>
                        )}
                      </Column>
                    </Card>
                  ))}
                </Grid>
              </Column>
            ))
          )}
        </Column>
      </Column>
      {dialog && (
        <KnowledgeNoteDialog
          {...dialog}
          onClose={() => setDialog(undefined)}
          onSave={onSave}
          onRemove={onRemove}
        />
      )}
    </Column>
  );
}
