import { groupKnowledgeNotes } from "@agent-desktop/shared";
import type { KnowledgeApi, KnowledgeNote } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Icon } from "@once-ui-system/core/components/Icon";
import { IconButton } from "@once-ui-system/core/components/IconButton";
import { Input } from "@once-ui-system/core/components/Input";
import { Logo } from "@once-ui-system/core/components/Logo";
import { Row } from "@once-ui-system/core/components/Row";
import { Table, type TableColumn } from "@once-ui-system/core/components/Table";
import { Text } from "@once-ui-system/core/components/Text";
import { useState } from "react";
import icon from "../../../resources/icon.png?url";
import { KnowledgeNoteDialog } from "./knowledge-note-dialog";

type KnowledgeRow =
  | { kind: "area"; area: string; count: number; expanded: boolean }
  | { kind: "note"; note: KnowledgeNote };

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function matchesNote(note: KnowledgeNote, query: string) {
  return [note.title, note.area, note.bodyText, ...note.paths].some((value) =>
    value.toLocaleLowerCase().includes(query),
  );
}

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
  const [dialog, setDialog] = useState<{
    note: KnowledgeNote | null;
    area: string;
    deleteOnly?: boolean;
  }>();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsedMatches, setCollapsedMatches] = useState<ReadonlySet<string>>(() => new Set());

  const allNotes = notes ?? [];
  const query = search.trim().toLocaleLowerCase();
  const matches = query ? allNotes.filter((note) => matchesNote(note, query)) : allNotes;
  const groups = groupKnowledgeNotes(matches);
  const closedAreas = query ? collapsedMatches : collapsed;
  const rows = [...groups].flatMap<KnowledgeRow>(([area, areaNotes]) => {
    const expanded = !closedAreas.has(area);
    const group: KnowledgeRow = { kind: "area", area, count: areaNotes.length, expanded };
    return expanded
      ? [group, ...areaNotes.map((note) => ({ kind: "note" as const, note }))]
      : [group];
  });

  function changeSearch(value: string) {
    setSearch(value);
    setCollapsedMatches(new Set());
  }

  function toggleArea(area: string) {
    const setClosedAreas = query ? setCollapsedMatches : setCollapsed;
    setClosedAreas((previous) => {
      const next = new Set(previous);
      if (!next.delete(area)) next.add(area);
      return next;
    });
  }

  const columns: TableColumn<KnowledgeRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) =>
        row.kind === "area" ? (
          <Button
            type="button"
            size="s"
            variant="tertiary"
            className="knowledge-row-button"
            aria-label={row.area}
            aria-description={countLabel(row.count, "note")}
            aria-expanded={row.expanded}
            onClick={() => toggleArea(row.area)}
          >
            <Row gap="8" vertical="center" minWidth="0">
              <Icon name={row.expanded ? "chevronDown" : "chevronRight"} size="xs" decorative />
              <Icon name="folder" size="s" onBackground="brand-medium" decorative />
              <span className="knowledge-name">{row.area}</span>
              <Text textVariant="label-default-s" onBackground="neutral-weak">
                {countLabel(row.count, "note")}
              </Text>
            </Row>
          </Button>
        ) : (
          <Button
            type="button"
            size="s"
            variant="tertiary"
            className="knowledge-row-button knowledge-note-button"
            aria-haspopup="dialog"
            onClick={() => setDialog({ note: row.note, area: row.note.area })}
          >
            <Row gap="8" vertical="center" minWidth="0">
              <Icon name="file" size="s" onBackground="neutral-weak" decorative />
              <span className="knowledge-name">{row.note.title}</span>
            </Row>
          </Button>
        ),
    },
    {
      key: "paths",
      header: "File paths",
      width: "7rem",
      hide: { xs: true },
      align: "right",
      cell: (row) =>
        row.kind === "note" && (
          <Text textVariant="body-default-s" onBackground="neutral-weak">
            {row.note.paths.length}
          </Text>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "5rem",
      align: "right",
      cell: (row) => (
        <Row horizontal="end">
          {row.kind === "area" ? (
            <IconButton
              type="button"
              icon="plus"
              variant="tertiary"
              size="s"
              tooltip="Add note"
              aria-label={`Add note in ${row.area}`}
              aria-haspopup="dialog"
              onClick={() => setDialog({ note: null, area: row.area })}
            />
          ) : (
            <IconButton
              type="button"
              icon="trash"
              variant="tertiary"
              tone="danger"
              size="s"
              tooltip="Delete note"
              aria-label={`Delete note: ${row.note.title}`}
              aria-haspopup="dialog"
              onClick={() => setDialog({ note: row.note, area: row.note.area, deleteOnly: true })}
            />
          )}
        </Row>
      ),
    },
  ];

  return (
    <Column minHeight="100dvh" fillWidth background="page" className="knowledge-page">
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
        <Column fillWidth maxWidth="68rem" gap="16">
          <Row fillWidth horizontal="between" vertical="center" gap="12" wrap>
            <Heading as="h1" textVariant="heading-strong-xl">
              Company Knowledge
            </Heading>
            <Row gap="8" vertical="center" wrap>
              <Row width="16rem" maxWidth="100%">
                <Input
                  id="knowledge-search"
                  label="Search notes"
                  placeholder="Search notes, areas, or paths"
                  type="search"
                  size="xxs"
                  fillWidth
                  prefix={<Icon name="search" size="xs" onBackground="neutral-weak" decorative />}
                  value={search}
                  onValueChange={changeSearch}
                  disabled={!notes || !!error}
                />
              </Row>
              <Button
                type="button"
                prefixIcon="plus"
                size="s"
                aria-haspopup="dialog"
                disabled={!notes || !!error}
                onClick={() => setDialog({ note: null, area: "" })}
              >
                New note
              </Button>
            </Row>
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
          ) : (
            <>
              {notes && (
                <Row
                  fillWidth
                  gap="8"
                  paddingX="16"
                  paddingY="12"
                  vertical="center"
                  background="surface"
                  border
                  radius="l"
                  role="status"
                >
                  <Icon name="folder" size="s" onBackground="neutral-weak" decorative />
                  <Text textVariant="label-default-s" onBackground="neutral-weak">
                    {query
                      ? `${matches.length} of ${countLabel(notes.length, "note")}`
                      : countLabel(notes.length, "note")}
                    {" · "}
                    {countLabel(groups.size, "area")}
                  </Text>
                </Row>
              )}
              <Table
                aria-label="Company Knowledge notes"
                className="knowledge-table"
                compact
                columns={columns}
                rows={rows}
                loading={!notes}
                getRowId={(row) =>
                  row.kind === "note" ? `note:${row.note.id}` : `area:${row.area}`
                }
                rowClassName={(row) => (row.kind === "area" ? "knowledge-area-row" : undefined)}
                emptyState={
                  <Column padding="16" gap="8" className="knowledge-table-empty">
                    <Heading as="h2" textVariant="heading-strong-s">
                      {query ? "No matching notes" : "No notes yet"}
                    </Heading>
                    <Text onBackground="neutral-weak" textVariant="body-default-s">
                      {query
                        ? "Try another note title, area, phrase, or file path."
                        : "Give your first note an area so you can find it when starting a plan."}
                    </Text>
                    {query && (
                      <Row>
                        <Button
                          type="button"
                          variant="secondary"
                          size="s"
                          onClick={() => changeSearch("")}
                        >
                          Clear search
                        </Button>
                      </Row>
                    )}
                  </Column>
                }
              />
            </>
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
