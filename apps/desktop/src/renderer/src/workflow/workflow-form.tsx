import {
  groupKnowledgeNotes,
  isWorkflowProvider,
  openWorkItemBlockers,
  simulatedIssueLimits,
  workflowProviders,
} from "@agent-desktop/shared";
import type {
  CustomPlanOptions,
  KnowledgeNote,
  WorkflowApi,
  WorkflowProvider,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Button } from "@once-ui-system/core/components/Button";
import { Checkbox } from "@once-ui-system/core/components/Checkbox";
import { Column } from "@once-ui-system/core/components/Column";
import { Dialog } from "@once-ui-system/core/components/Dialog";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { IconButton } from "@once-ui-system/core/components/IconButton";
import { Input } from "@once-ui-system/core/components/Input";
import { RadioGroup } from "@once-ui-system/core/components/RadioGroup";
import { Row } from "@once-ui-system/core/components/Row";
import { Select } from "@once-ui-system/core/components/Select";
import { Text } from "@once-ui-system/core/components/Text";
import { Textarea } from "@once-ui-system/core/components/Textarea";
import { BlobFx } from "@once-ui-system/fx";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { JiraDataStatus, useJiraQuery } from "./jira-query";
import { WorkItemPreview } from "./work-item-preview";
import { workflowError } from "./workflow-error";

const manualModel = ":custom";
const sampleIssue = {
  title: "Scaffold Pocket Tasks, a personal task tracker",
  description: `Start from an empty workspace and scaffold a small browser app with Vite and vanilla TypeScript.

Acceptance criteria
- Add a task with a non-empty title, and show it in the list immediately.
- Mark tasks complete or incomplete.
- Preserve tasks and their completion state when the page reloads using localStorage.
- Include an empty state, labeled keyboard-accessible controls, and a README with commands to run and build locally.
- Verify the production build and describe how to check each behavior.

Keep this first ticket focused on the basic workflow. Leave filters, due dates, and editing for follow-up issues.`,
};
const editTaskIssue = {
  title: "Edit an existing task in Pocket Tasks",
  description: `Continue from the Pocket Tasks starter issue in this workspace. The app already adds tasks, toggles completion, and persists the list in localStorage. Inspect the existing code and reuse its task model, rendering, and persistence.

Acceptance criteria
- Add an accessible Edit action for each task. Retrieve the selected task by its stable ID and prefill the editor with its current title.
- On Save, trim the title and reject a blank value. Update that task by ID and persist it through the existing storage code. Keep its ID, completion state, and list position.
- Cancel or Escape closes the editor without saving. If the selected task no longer exists, show a helpful message and leave the list unchanged.
- Keep existing tasks readable from localStorage. Preserve the existing add and completion flows.

Verification
- Add two tasks with the same title and mark one complete. Edit that task and confirm the other task is untouched.
- Confirm a blank title cannot be saved and canceling leaves the task unchanged.
- Reload and verify the edited title, completion state, and task order. Run the existing project checks and production build.

Keep this follow-up focused on reading and updating an existing task. Use the starter app's local storage.`,
};
type SimulationScenario = "scaffold" | "edit-task";
type IssueSource = "assigned" | "board" | "simulation";

function useWorkflowQuery<T>(
  load: (() => Promise<T>) | null,
  refresh: number,
  fallback = "Jira could not be loaded.",
) {
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
        if (active) setResult({ load, refresh, error: workflowError(error, fallback) });
      },
    );
    return () => {
      active = false;
    };
  }, [fallback, load, refresh]);
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
  open,
  onClose,
  api,
  defaultProvider,
  knowledge,
  onOpenKnowledge,
  onCreated,
}: {
  open: boolean;
  onClose(): void;
  api: WorkflowApi;
  defaultProvider: WorkflowProvider;
  knowledge?: KnowledgeNote[];
  onOpenKnowledge(): void;
  onCreated(workflow: WorkflowRecord): void;
}) {
  const [showIssueStep, setShowIssueStep] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const [issueSource, setIssueSource] = useState<IssueSource>("assigned");
  const [scenario, setScenario] = useState<SimulationScenario>("scaffold");
  const [simulatedIssue, setSimulatedIssue] = useState(sampleIssue);
  const simulating = issueSource === "simulation";
  const showJira = showIssueStep && !simulating;
  const assignedOnly = issueSource === "assigned";
  const [board, setBoard] = useState(0);
  const [sprint, setSprint] = useState(0);
  const [issueKey, setIssueKey] = useState("");
  const [selectedProvider, setProvider] = useState<WorkflowProvider>();
  const provider = selectedProvider ?? defaultProvider;
  const [chosenWorkspace, setWorkspacePath] = useState<string>();
  const loadSavedWorkspace = useCallback(() => api.restoreWorkspace(), [api]);
  const savedWorkspace = useWorkflowQuery(
    loadSavedWorkspace,
    0,
    "The saved workspace could not be opened.",
  );
  const workspacePath = chosenWorkspace ?? savedWorkspace?.value ?? "";
  const [pending, setPending] = useState<"picker" | "save" | "custom" | null>(null);
  const [error, setError] = useState("");
  const [planningOptionsRequested, setPlanningOptionsRequested] = useState(false);
  const [planningOptionsRefresh, setPlanningOptionsRefresh] = useState(0);
  const [modelChoice, setModelChoice] = useState("");
  const [modelId, setModelId] = useState("");
  const [selectedEffort, setEffort] = useState("");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const model = modelChoice === manualModel ? modelId.trim() : modelChoice;
  const formId = useId();
  const [selectedNoteIds, setSelectedNoteIds] = useState(() => new Set<string>());
  const areas = groupKnowledgeNotes(knowledge ?? []);
  const knowledgeNoteIds = (knowledge ?? [])
    .filter(({ id }) => selectedNoteIds.has(id))
    .map(({ id }) => id);
  const loadBoards = useCallback((sync: boolean) => api.boards(sync), [api]);
  const boards = useJiraQuery(showJira && !assignedOnly ? loadBoards : null);
  const boardData = boards.response?.data;
  const boardAvailable = !!boardData?.some(({ id }) => id === board);
  const loadSprints = useCallback((sync: boolean) => api.activeSprints(board, sync), [api, board]);
  const sprints = useJiraQuery(showJira && !assignedOnly && boardAvailable ? loadSprints : null);
  const sprintData = sprints.response?.data;
  const sprintAvailable = !!sprintData?.some(({ id }) => id === sprint);
  const loadAssignedIssues = useCallback((sync: boolean) => api.assignedSprintIssues(sync), [api]);
  const loadSprintIssues = useCallback(
    (sync: boolean) => api.sprintIssues(board, sprint, sync),
    [api, board, sprint],
  );
  const issues = useJiraQuery(
    showJira
      ? assignedOnly
        ? loadAssignedIssues
        : sprintAvailable
          ? loadSprintIssues
          : null
      : null,
  );
  const issueData = issues.response?.data;
  const issueAvailable = !!issueData?.some(({ key }) => key === issueKey);
  const loadIssue = useCallback((sync: boolean) => api.issue(issueKey, sync), [api, issueKey]);
  const issue = useJiraQuery(showJira && issueAvailable ? loadIssue : null);
  const currentIssue = issue.response?.data;
  const blockers = openWorkItemBlockers(currentIssue?.linkedIssues);
  const jiraRequests = [boards, sprints, issues, issue];
  const jiraError = jiraRequests.find(({ error }) => error)?.error;
  const syncError = jiraRequests.find(({ response }) => response?.syncError)?.response?.syncError;
  const jiraPending = jiraRequests.some(({ pending }) => pending);
  const issueInput = simulating
    ? simulatedIssue.title.trim() && simulatedIssue.description.trim()
      ? { simulatedIssue }
      : undefined
    : currentIssue && { issueKey: currentIssue.key };
  const canStart =
    pending === null && !jiraPending && !!issueInput && !!workspacePath && !blockers.length;
  const loadPlanningOptions = useCallback(
    () => api.planningOptions(provider, workspacePath),
    [api, provider, workspacePath],
  );
  const planningOptions = useWorkflowQuery(
    showIssueStep && planningOptionsRequested ? loadPlanningOptions : null,
    planningOptionsRefresh,
    "Planning options could not be loaded.",
  );
  const modelEfforts =
    planningOptions?.value?.models.find(({ id }) => id === model)?.efforts ??
    planningOptions?.value?.efforts ??
    [];
  const effort = modelEfforts.some(({ id }) => id === selectedEffort) ? selectedEffort : "";

  useEffect(() => {
    sheet.current?.focus();
  }, [showIssueStep]);

  function resetCustomSettings() {
    setModelChoice("");
    setModelId("");
    setEffort("");
    setSkillIds([]);
  }

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
      if (path && path !== workspacePath) {
        setWorkspacePath(path);
        resetCustomSettings();
      }
    } catch (failure) {
      setError(workflowError(failure, "The folder picker could not open."));
    } finally {
      setPending(null);
    }
  }

  async function start(customPlan?: CustomPlanOptions) {
    if (!canStart || !issueInput) return;
    setError("");
    setPending(customPlan ? "custom" : "save");
    try {
      onCreated(
        await api.create({
          ...issueInput,
          provider,
          workspacePath,
          ...(knowledgeNoteIds.length ? { knowledgeNoteIds } : {}),
          ...(customPlan ? { customPlan } : {}),
        }),
      );
    } catch (failure) {
      setError(workflowError(failure, "The workflow could not be saved."));
    } finally {
      setPending(null);
    }
  }

  function checkJiraAgain() {
    setError("");
    issue.sync();
  }

  function syncJira() {
    setError("");
    for (const request of jiraRequests) request.sync();
  }

  return (
    <Dialog
      ref={sheet}
      tabIndex={-1}
      variant="sheet"
      className="workflow-intake-sheet"
      open={open}
      title={
        showIssueStep ? (simulating ? "Simulate issue" : "Start from Jira") : "Choose a workspace"
      }
      backdrop={<BlobFx position="absolute" fill seed={42} />}
      description={
        showIssueStep
          ? simulating
            ? "Step 2 of 3 · Edit a sample issue for local testing."
            : "Step 2 of 3 · Choose an issue from an active sprint."
          : "Step 1 of 3 · Select the folder where planning will run."
      }
      maxWidth="42rem"
      closeOnClickaway={false}
      showClose={pending === null}
      onClose={() => {
        if (!pending) onClose();
      }}
      footer={
        <Row fillWidth gap="8" wrap horizontal="end">
          <Button type="button" variant="tertiary" disabled={pending !== null} onClick={onClose}>
            Cancel
          </Button>
          {showIssueStep ? (
            <>
              <Button
                type="button"
                variant="secondary"
                prefixIcon="arrowLeft"
                disabled={pending !== null}
                onClick={() => {
                  setError("");
                  setShowIssueStep(false);
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!canStart || (modelChoice === manualModel && !model)}
                onClick={() =>
                  void start({
                    skillIds,
                    ...(model ? { model } : {}),
                    ...(effort ? { effort } : {}),
                  })
                }
              >
                {pending === "custom" ? "Starting…" : "Start Plan Custom"}
              </Button>
              <Button type="submit" form={formId} suffixIcon="arrowRight" disabled={!canStart}>
                {pending === "save" ? "Starting…" : "Start Plan"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={pending !== null || !workspacePath}
                onClick={() => {
                  setIssueSource("simulation");
                  setShowIssueStep(true);
                }}
              >
                Simulate issue
              </Button>
              <Button
                type="button"
                suffixIcon="arrowRight"
                disabled={pending !== null || !workspacePath}
                onClick={() => {
                  if (simulating) setIssueSource("assigned");
                  setShowIssueStep(true);
                }}
              >
                Continue to Jira
              </Button>
            </>
          )}
        </Row>
      }
    >
      {!showIssueStep ? (
        <Column gap="12" paddingTop="8" horizontal="start">
          {!savedWorkspace && <Text role="status">Checking for a saved workspace…</Text>}
          {(error || (!chosenWorkspace && savedWorkspace?.error)) && (
            <Feedback tone="danger" description={error || savedWorkspace?.error} />
          )}
          <Button
            type="button"
            variant="secondary"
            prefixIcon="folder"
            disabled={pending !== null || !savedWorkspace}
            onClick={() => void chooseWorkspace()}
          >
            {workspacePath ? "Change folder" : "Choose folder"}
          </Button>
          {workspacePath && <Text textVariant="body-default-s">{workspacePath}</Text>}
        </Column>
      ) : (
        <Column
          as="form"
          id={formId}
          gap="16"
          paddingTop="8"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <Text textVariant="body-default-s" onBackground="neutral-weak">
            Workspace: {workspacePath}
          </Text>
          {!simulating && (
            <>
              <Row wrap gap="12" horizontal="between" vertical="start">
                <Column gap="4">
                  {boards.response && <JiraDataStatus label="Boards" response={boards.response} />}
                  {sprints.response && (
                    <JiraDataStatus label="Active sprints" response={sprints.response} />
                  )}
                  {issues.response && <JiraDataStatus label="Issues" response={issues.response} />}
                  {issue.response && (
                    <JiraDataStatus label="Issue details" response={issue.response} />
                  )}
                </Column>
                <Button
                  type="button"
                  variant="secondary"
                  prefixIcon="refresh"
                  disabled={pending !== null || jiraPending}
                  onClick={syncJira}
                >
                  {jiraPending ? "Loading Jira…" : "Sync"}
                </Button>
              </Row>
              {syncError && (
                <Feedback
                  tone="warning"
                  title="Sync failed. Showing cached data."
                  description={syncError}
                />
              )}
            </>
          )}
          <Select
            id="jira-scope"
            label="Show issues"
            value={issueSource}
            disabled={pending !== null}
            options={[
              { value: "assigned", label: "Assigned to me" },
              { value: "board", label: "Browse by board" },
              { value: "simulation", label: "Simulate issue" },
            ]}
            onValueChange={(value) => {
              if (value === "assigned" || value === "board" || value === "simulation") {
                setIssueSource(value);
                setIssueKey("");
                setError("");
              }
            }}
          />
          {simulating && (
            <Column gap="12">
              <Select
                id="simulation-scenario"
                label="Scenario"
                value={scenario}
                disabled={pending !== null}
                options={[
                  { value: "scaffold", label: "Scaffold Pocket Tasks" },
                  { value: "edit-task", label: "Edit an existing task" },
                ]}
                onValueChange={(value) => {
                  if (value === "scaffold" || value === "edit-task") {
                    setScenario(value);
                    setSimulatedIssue(value === "scaffold" ? sampleIssue : editTaskIssue);
                  }
                }}
              />
              <Input
                id="simulated-issue-title"
                label="Issue title"
                value={simulatedIssue.title}
                maxLength={simulatedIssueLimits.title}
                disabled={pending !== null}
                onChange={(event) =>
                  setSimulatedIssue({ ...simulatedIssue, title: event.currentTarget.value })
                }
              />
              <Textarea
                id="simulated-issue-description"
                label="Issue details"
                value={simulatedIssue.description}
                lines={10}
                maxLength={simulatedIssueLimits.description}
                disabled={pending !== null}
                onChange={(event) =>
                  setSimulatedIssue({ ...simulatedIssue, description: event.currentTarget.value })
                }
              />
              <Text textVariant="body-default-s" onBackground="neutral-weak">
                This issue is saved locally and sent to the selected planning provider.
              </Text>
            </Column>
          )}
          {issueSource === "board" && (
            <Select
              id="jira-board"
              label="Jira board"
              aria-busy={boards.pending}
              value={boardAvailable ? String(board) : ""}
              placeholder={
                boardData
                  ? boardData.length
                    ? "Choose a board"
                    : "No Scrum boards"
                  : boards?.error
                    ? "Jira unavailable"
                    : "Loading boards…"
              }
              options={[
                ...(board ? [{ value: "", label: "Clear board" }] : []),
                ...(boardData?.map(({ id, name }) => ({ value: String(id), label: name })) ?? []),
              ]}
              disabled={pending !== null || !boardData?.length}
              onValueChange={(value) => {
                setBoard(Number(value));
                setSprint(0);
                setIssueKey("");
              }}
            />
          )}
          {issueSource === "board" && boardAvailable && (
            <Select
              id="jira-sprint"
              label="Active sprint"
              value={sprintAvailable ? String(sprint) : ""}
              placeholder={
                sprintData
                  ? sprintData.length
                    ? "Choose a sprint"
                    : "No active sprints"
                  : sprints?.error
                    ? "Sprints unavailable"
                    : "Loading sprints…"
              }
              options={[
                ...(sprint ? [{ value: "", label: "Clear sprint" }] : []),
                ...(sprintData?.map(({ id, name }) => ({ value: String(id), label: name })) ?? []),
              ]}
              disabled={pending !== null || !sprintData?.length}
              onValueChange={(value) => {
                setSprint(Number(value));
                setIssueKey("");
              }}
            />
          )}
          {(assignedOnly || sprintAvailable) && (
            <Select
              id="jira-issue"
              label="Issue"
              aria-busy={issues.pending}
              value={issueAvailable ? issueKey : ""}
              placeholder={
                issueData
                  ? issueData.length
                    ? "Choose an issue"
                    : assignedOnly
                      ? "No issues assigned to you in active sprints"
                      : "No issues in this sprint"
                  : issues?.error
                    ? "Issues unavailable"
                    : "Loading issues…"
              }
              options={[
                ...(issueKey ? [{ value: "", label: "Clear issue" }] : []),
                ...(issueData?.map(({ key, title }) => ({
                  value: key,
                  label: `${key} · ${title}`,
                })) ?? []),
              ]}
              disabled={pending !== null || !issueData?.length}
              onValueChange={(value) => {
                if (typeof value === "string") setIssueKey(value);
              }}
            />
          )}
          {issue.pending && !currentIssue && <Text role="status">Loading issue details…</Text>}
          {!!blockers.length && (
            <Feedback
              tone="warning"
              title="Planning is blocked"
              description="Resolve these dependencies in Jira, then check again."
            >
              <Column gap="8">
                {blockers.map(({ key, title, status, statusCategory }, index) => (
                  <Text key={`${key}-${index}`} as="p" textVariant="body-default-s">
                    {key}
                    {title ? ` · ${title}` : ""} ·{" "}
                    {statusCategory ? (status ?? statusCategory) : "Status unverified"}
                  </Text>
                ))}
                <Row>
                  <Button
                    type="button"
                    variant="secondary"
                    size="s"
                    prefixIcon="refresh"
                    disabled={pending !== null || issue.pending}
                    onClick={checkJiraAgain}
                  >
                    Check Jira again
                  </Button>
                </Row>
              </Column>
            </Feedback>
          )}
          {currentIssue && (
            <WorkItemPreview
              linkedIssueVariant="sheet"
              issue={currentIssue}
              openJiraLink={api.openJiraLink}
              loadIssue={api.linkedIssue}
            />
          )}
          {jiraError && (
            <Feedback tone="danger" description={jiraError}>
              <Button
                type="button"
                variant="secondary"
                disabled={jiraPending || pending !== null}
                onClick={syncJira}
              >
                Retry Jira
              </Button>
            </Feedback>
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
                disabled={pending !== null}
                onClick={onOpenKnowledge}
              >
                Open Company Knowledge
              </Button>
            </Column>
          </Accordion>
          <RadioGroup
            label="Provider"
            name="workflow-provider"
            orientation="horizontal"
            value={provider}
            disabled={pending !== null}
            options={Object.entries(workflowProviders).map(([value, label]) => ({ value, label }))}
            onValueChange={(value) => {
              if (isWorkflowProvider(value) && value !== provider) {
                setProvider(value);
                resetCustomSettings();
              }
            }}
          />
          <Accordion
            title="Custom Plan Settings (optional)"
            titleVariant="label-default-s"
            onOpenChange={(expanded) => {
              if (expanded) setPlanningOptionsRequested(true);
            }}
          >
            <Column gap="12">
              {!planningOptions && <Text role="status">Loading models and installed skills…</Text>}
              {planningOptions?.error && (
                <Feedback tone="warning" description={planningOptions.error}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="s"
                    disabled={pending !== null}
                    onClick={() => setPlanningOptionsRefresh((count) => count + 1)}
                  >
                    Reload planning options
                  </Button>
                </Feedback>
              )}
              <Select
                id="custom-plan-model"
                label="Model"
                value={modelChoice}
                options={[
                  { value: "", label: "Provider default" },
                  ...(planningOptions?.value?.models.map(({ id, name }) => ({
                    value: id,
                    label: name,
                  })) ?? []),
                  { value: manualModel, label: "Enter a model ID" },
                ]}
                disabled={pending !== null}
                onValueChange={(value) => {
                  if (typeof value === "string" && value !== modelChoice) {
                    setModelChoice(value);
                    setEffort("");
                  }
                }}
              />
              {modelChoice === manualModel && (
                <Input
                  id="custom-plan-model-id"
                  label="Model ID"
                  value={modelId}
                  disabled={pending !== null}
                  onChange={(event) => {
                    setModelId(event.currentTarget.value);
                    setEffort("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                />
              )}
              <Select
                id="custom-plan-effort"
                label="Effort"
                value={effort}
                options={[
                  { value: "", label: "Provider default" },
                  ...modelEfforts.map(({ id, description }) => ({
                    value: id,
                    label: id === "xhigh" ? "Extra high" : id.charAt(0).toUpperCase() + id.slice(1),
                    description,
                  })),
                ]}
                description={
                  planningOptions?.value && !modelEfforts.length
                    ? "Choose a model with effort levels in the provider catalog."
                    : undefined
                }
                disabled={pending !== null || !modelEfforts.length}
                onValueChange={(value) => {
                  if (typeof value === "string") setEffort(value);
                }}
              />
              {planningOptions?.value && (
                <Column gap="8">
                  <Text textVariant="label-default-s">Installed skills (optional)</Text>
                  {planningOptions.value.skills.length ? (
                    <Column gap="8" maxHeight="16rem" overflowY="auto">
                      {planningOptions.value.skills.map(({ id, name, description }) => (
                        <Checkbox
                          key={id}
                          label={name}
                          description={description}
                          checked={skillIds.includes(id)}
                          disabled={pending !== null}
                          onCheckedChange={(checked) =>
                            setSkillIds((selected) =>
                              checked
                                ? [...selected, id]
                                : selected.filter((value) => value !== id),
                            )
                          }
                        />
                      ))}
                    </Column>
                  ) : (
                    <Text textVariant="body-default-s">
                      No installed skills found for this workspace.
                    </Text>
                  )}
                </Column>
              )}
            </Column>
          </Accordion>
          {error && (
            <Feedback tone="danger" description={error}>
              {!!currentIssue && !blockers.length && (
                <Row>
                  <Button
                    type="button"
                    variant="secondary"
                    size="s"
                    prefixIcon="refresh"
                    onClick={checkJiraAgain}
                  >
                    Check Jira again
                  </Button>
                </Row>
              )}
            </Feedback>
          )}
        </Column>
      )}
    </Dialog>
  );
}
