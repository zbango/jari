import { groupKnowledgeNotes, workflowProviders } from "@agent-desktop/shared";
import type {
  KnowledgeNote,
  WorkflowApi,
  WorkflowProvider,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Checkbox } from "@once-ui-system/core/components/Checkbox";
import { Column } from "@once-ui-system/core/components/Column";
import { IconButton } from "@once-ui-system/core/components/IconButton";
import { Row } from "@once-ui-system/core/components/Row";
import { useCallback, useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { WorkItemPreview } from "./work-item-preview";

export function workflowError(error: unknown, fallback: string): string {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
    : fallback;
}

function useJiraQuery<T>(load: (() => Promise<T>) | null, refresh: number) {
  const [result, setResult] = useState<{
    load: () => Promise<T>;
    refresh: number;
    value?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (!load) return;
    let active = true;
    void load().then(
      (value) => {
        if (active) setResult({ load, value, refresh });
      },
      (error: unknown) => {
        if (active)
          setResult({ load, refresh, error: workflowError(error, "Jira could not be loaded.") });
      },
    );
    return () => {
      active = false;
    };
  }, [load, refresh]);
  return result?.load === load && result.refresh === refresh ? result : undefined;
}

function KnowledgeArea({
  area,
  notes,
  selectedNoteIds,
  disabled,
  onSelect,
}: {
  area: string;
  notes: KnowledgeNote[];
  selectedNoteIds: ReadonlySet<string>;
  disabled: boolean;
  onSelect(notes: KnowledgeNote[], checked: boolean): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const notesId = useId();
  const selectedCount = notes.filter(({ id }) => selectedNoteIds.has(id)).length;

  return (
    <Column borderTop paddingTop="8" gap="4">
      <Row vertical="center" horizontal="between" gap="8">
        <Checkbox
          label={area}
          description={`${selectedCount} of ${notes.length} selected`}
          checked={selectedCount === notes.length}
          indeterminate={selectedCount > 0 && selectedCount < notes.length}
          disabled={disabled}
          onCheckedChange={(checked) => onSelect(notes, checked)}
        />
        <IconButton
          type="button"
          variant="ghost"
          size="s"
          icon={expanded ? "chevronDown" : "chevronRight"}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${area}`}
          aria-expanded={expanded}
          aria-controls={notesId}
          onClick={() => setExpanded((open) => !open)}
        />
      </Row>
      <Column id={notesId} hide={!expanded} hidden={!expanded} paddingLeft="20" gap="4">
        {notes.map((note) => (
          <Checkbox
            key={note.id}
            label={note.title}
            checked={selectedNoteIds.has(note.id)}
            disabled={disabled}
            onCheckedChange={(checked) => onSelect([note], checked)}
          />
        ))}
      </Column>
    </Column>
  );
}

export function WorkflowForm({
  api,
  defaultProvider,
  knowledge,
  onOpenKnowledge,
  onCreated,
}: {
  api: WorkflowApi;
  defaultProvider: WorkflowProvider;
  knowledge?: KnowledgeNote[];
  onOpenKnowledge(): void;
  onCreated(workflow: WorkflowRecord): void;
}) {
  const [assignedOnly, setAssignedOnly] = useState(true);
  const [board, setBoard] = useState(0);
  const [sprint, setSprint] = useState(0);
  const [issueKey, setIssueKey] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selectedProvider, setProvider] = useState<WorkflowProvider>();
  const provider = selectedProvider ?? defaultProvider;
  const [workspacePath, setWorkspacePath] = useState("");
  const [pending, setPending] = useState<"picker" | "save" | null>(null);
  const [error, setError] = useState("");
  const [selectedNoteIds, setSelectedNoteIds] = useState(() => new Set<string>());
  const areas = groupKnowledgeNotes(knowledge ?? []);
  const knowledgeNoteIds = (knowledge ?? [])
    .filter(({ id }) => selectedNoteIds.has(id))
    .map(({ id }) => id);
  const loadBoards = useCallback(() => api.boards(), [api]);
  const boards = useJiraQuery(assignedOnly ? null : loadBoards, refresh);
  const loadSprints = useCallback(() => api.activeSprints(board), [api, board]);
  const sprints = useJiraQuery(!assignedOnly && board ? loadSprints : null, refresh);
  const loadAssignedIssues = useCallback(() => api.assignedSprintIssues(), [api]);
  const loadSprintIssues = useCallback(() => api.sprintIssues(board, sprint), [api, board, sprint]);
  const issues = useJiraQuery(
    assignedOnly ? loadAssignedIssues : sprint ? loadSprintIssues : null,
    refresh,
  );
  const loadIssue = useCallback(() => api.issue(issueKey), [api, issueKey]);
  const issue = useJiraQuery(issueKey ? loadIssue : null, refresh);
  const jiraError = boards?.error ?? sprints?.error ?? issues?.error ?? issue?.error;

  function selectNotes(notes: KnowledgeNote[], checked: boolean) {
    setSelectedNoteIds((previous) => {
      const next = new Set(previous);
      for (const { id } of notes) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function chooseWorkspace() {
    setError("");
    setPending("picker");
    try {
      const path = await api.chooseWorkspace();
      if (path) setWorkspacePath(path);
    } catch (failure) {
      setError(workflowError(failure, "The folder picker could not open."));
    } finally {
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !issue?.value || !workspacePath) return;
    setError("");
    setPending("save");
    try {
      onCreated(
        await api.create({
          issueKey: issue.value.key,
          provider,
          workspacePath,
          ...(knowledgeNoteIds.length ? { knowledgeNoteIds } : {}),
        }),
      );
    } catch (failure) {
      setError(workflowError(failure, "The workflow could not be saved."));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <h2>Start from Jira</h2>
      <p className="inspector-description">
        Choose an issue from an active sprint to plan in your workspace.
      </p>
      <form className="workflow-form" onSubmit={submit}>
        <label htmlFor="jira-scope">Show issues</label>
        <select
          id="jira-scope"
          value={assignedOnly ? "assigned" : "board"}
          disabled={pending !== null}
          onChange={(event) => {
            setAssignedOnly(event.currentTarget.value === "assigned");
            setIssueKey("");
          }}
        >
          <option value="assigned">Assigned to me</option>
          <option value="board">Browse by board</option>
        </select>
        {!assignedOnly && (
          <>
            <label htmlFor="jira-board">Jira board</label>
            <select
              id="jira-board"
              aria-busy={!boards}
              value={board}
              disabled={pending !== null || !boards?.value}
              onChange={(event) => {
                setBoard(Number(event.currentTarget.value));
                setSprint(0);
                setIssueKey("");
              }}
            >
              <option value={0}>
                {boards?.value
                  ? boards.value.length
                    ? "Choose a board"
                    : "No Scrum boards"
                  : boards?.error
                    ? "Jira unavailable"
                    : "Loading boards…"}
              </option>
              {boards?.value?.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </>
        )}
        {!assignedOnly && board > 0 && (
          <>
            <label htmlFor="jira-sprint">Active sprint</label>
            <select
              id="jira-sprint"
              value={sprint}
              disabled={pending !== null || !sprints?.value}
              onChange={(event) => {
                setSprint(Number(event.currentTarget.value));
                setIssueKey("");
              }}
            >
              <option value={0}>
                {sprints?.value
                  ? sprints.value.length
                    ? "Choose a sprint"
                    : "No active sprints"
                  : sprints?.error
                    ? "Sprints unavailable"
                    : "Loading sprints…"}
              </option>
              {sprints?.value?.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </>
        )}
        {(assignedOnly || sprint > 0) && (
          <>
            <label htmlFor="jira-issue">Issue</label>
            <select
              id="jira-issue"
              aria-busy={!issues}
              value={issueKey}
              disabled={pending !== null || !issues?.value}
              onChange={(event) => setIssueKey(event.currentTarget.value)}
            >
              <option value="">
                {issues?.value
                  ? issues.value.length
                    ? "Choose an issue"
                    : assignedOnly
                      ? "No issues assigned to you in active sprints"
                      : "No issues in this sprint"
                  : issues?.error
                    ? "Issues unavailable"
                    : "Loading issues…"}
              </option>
              {issues?.value?.map(({ key, title }) => (
                <option key={key} value={key}>
                  {key} · {title}
                </option>
              ))}
            </select>
          </>
        )}
        {issueKey && !issue?.value && !issue?.error && <p role="status">Loading issue details…</p>}
        {issue?.value && <WorkItemPreview issue={issue.value} openJiraLink={api.openJiraLink} />}
        {jiraError && (
          <>
            <p className="form-error" role="alert">
              {jiraError}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRefresh((value) => value + 1)}
            >
              Retry Jira
            </Button>
          </>
        )}

        <Accordion
          title={
            knowledgeNoteIds.length
              ? `Company Knowledge (${knowledgeNoteIds.length} selected)`
              : "Company Knowledge (optional)"
          }
          titleVariant="label-default-s"
        >
          <Column gap="8">
            {!!knowledge?.length && (
              <Checkbox
                label="Select all notes"
                checked={knowledgeNoteIds.length === knowledge.length}
                indeterminate={
                  knowledgeNoteIds.length > 0 && knowledgeNoteIds.length < knowledge.length
                }
                disabled={pending !== null}
                onCheckedChange={(checked) => selectNotes(knowledge, checked)}
              />
            )}
            {[...areas].map(([area, notes]) => (
              <KnowledgeArea
                key={area}
                area={area}
                notes={notes}
                selectedNoteIds={selectedNoteIds}
                disabled={pending !== null}
                onSelect={selectNotes}
              />
            ))}
            <Button
              type="button"
              variant="tertiary"
              size="s"
              prefixIcon="book"
              onClick={onOpenKnowledge}
            >
              Open Company Knowledge
            </Button>
          </Column>
        </Accordion>
        <fieldset disabled={pending !== null}>
          <legend>Provider</legend>
          <div className="provider-options">
            {(["codex", "claude"] as const).map((value) => (
              <label key={value} className="provider-option">
                <input
                  type="radio"
                  name="workflow-provider"
                  value={value}
                  checked={provider === value}
                  onChange={() => setProvider(value)}
                />
                {workflowProviders[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="workspace-field">
          <span className="field-label">Workspace</span>
          <Button
            type="button"
            variant="secondary"
            prefixIcon="folder"
            disabled={pending !== null}
            onClick={() => void chooseWorkspace()}
          >
            {workspacePath ? "Change folder" : "Choose folder"}
          </Button>
          {workspacePath && <span className="workspace-path">{workspacePath}</span>}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          suffixIcon="arrowRight"
          disabled={pending !== null || !issue?.value || !workspacePath}
          className="workflow-primary"
        >
          {pending === "save" ? "Starting…" : "Start plan"}
        </Button>
      </form>
    </>
  );
}
