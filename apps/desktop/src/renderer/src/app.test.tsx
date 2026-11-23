import type {
  JiraResponse,
  ProviderTranscriptEntry,
  WorkItem,
  WorkflowApi,
  WorkflowBuildTask,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { onceUIStyle } from "@agent-desktop/ui/theme";
import { LayoutProvider, ThemeProvider, ToastProvider } from "@once-ui-system/core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./app";
import { canvasStyleStorageKey } from "./workflow/workflow-canvas-style";

const desktop = { name: "Agent Desktop", version: "0.1.0" };
const issue: WorkItem = {
  key: "FIN-5546",
  title: "Show cleared payments",
  status: "To Do",
  url: "https://example.atlassian.net/browse/FIN-5546",
  description: "Display the settlement state.",
  comments: [{ author: "Review team", body: "Keep the existing permissions." }],
  references: [],
};
const saved: WorkflowRecord = {
  id: "workflow-1",
  createdAt: "2026-11-21T12:00:00Z",
  request: `${issue.key} · ${issue.title}`,
  workspacePath: "/workspaces/finance",
  provider: "claude",
  source: issue,
  plan: { state: "running" },
};

function jiraResponse<T>(data: T, source: JiraResponse<T>["source"] = "jira"): JiraResponse<T> {
  return { data, source, syncedAt: Date.parse("2026-11-21T12:00:00Z") };
}

function fixtureApi(records: WorkflowRecord[] = []): WorkflowApi {
  return {
    providerQuota: vi.fn().mockResolvedValue({ checkedAt: Date.now(), windows: [] }),
    editWorkflowSection: vi.fn(),
    knowledge: {
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      remove: vi.fn(),
    },
    list: vi.fn().mockResolvedValue(records),
    removeWorkflow: vi.fn().mockResolvedValue(undefined),
    restoreWorkspace: vi.fn().mockResolvedValue(saved.workspacePath),
    chooseWorkspace: vi.fn().mockResolvedValue(saved.workspacePath),
    openWorkspaceInCursor: vi.fn().mockResolvedValue(undefined),
    planningOptions: vi.fn().mockResolvedValue({ models: [], skills: [] }),
    assignedSprintIssues: vi.fn().mockResolvedValue(jiraResponse([issue])),
    boards: vi.fn().mockResolvedValue(jiraResponse([{ id: 1, name: "Finance" }])),
    activeSprints: vi.fn().mockResolvedValue(jiraResponse([{ id: 2, name: "Current sprint" }])),
    sprintIssues: vi.fn().mockResolvedValue(jiraResponse([issue])),
    issue: vi.fn().mockResolvedValue(jiraResponse(issue)),
    linkedIssue: vi.fn().mockResolvedValue(jiraResponse(issue)),
    openJiraLink: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(saved),
    retryPlan: vi.fn().mockResolvedValue(saved),
    replayPlan: vi.fn().mockResolvedValue(saved),
    answerPlan: vi.fn().mockResolvedValue(saved),
    generatePlanReview: vi.fn().mockResolvedValue(saved),
    approvePlan: vi.fn().mockResolvedValue({
      ...saved,
      build: { state: "ready", approvedAt: saved.createdAt },
    }),
    saveMilestone: vi.fn(),
    removeMilestone: vi.fn(),
    runMilestone: vi.fn(),
    saveStageSettings: vi.fn(),
    startBuild: vi.fn().mockResolvedValue({
      ...saved,
      build: { state: "completed", approvedAt: saved.createdAt, summary: "Implemented the tasks." },
    }),
    reviewBuildTask: vi.fn(),
    readBuildCommitDiff: vi.fn(),
    readTranscript: vi.fn().mockResolvedValue({ entries: [], hasMore: false, runs: [] }),
    exportTranscript: vi.fn(),
  };
}

function renderApp(api: WorkflowApi) {
  return render(
    <LayoutProvider>
      <ToastProvider>
        <App desktop={desktop} api={api} />
      </ToastProvider>
    </LayoutProvider>,
  );
}

it("adds a follow-up milestone from the canvas and runs it from the inspector", async () => {
  const record: WorkflowRecord = {
    ...saved,
    plan: { state: "ready", text: "Update the app." },
    build: { state: "completed", approvedAt: saved.createdAt, summary: "All tasks approved." },
  };
  const command = {
    title: "Testing",
    timing: "follow-up",
    executable: "pnpm",
    args: ["test"],
  } satisfies import("@agent-desktop/shared").MilestoneInput;
  const milestone = { ...command, id: "testing", state: "ready" as const };
  const api = fixtureApi([record]);
  vi.mocked(api.saveMilestone).mockResolvedValue({ ...record, milestones: [milestone] });
  vi.mocked(api.runMilestone).mockResolvedValue({
    ...record,
    milestones: [{ ...milestone, state: "completed", output: "All tests passed." }],
  });
  renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: "Add milestone" }));
  const details = within(screen.getByRole("complementary", { name: "Workflow details" }));
  fireEvent.change(details.getByLabelText("Name"), { target: { value: "Testing" } });
  fireEvent.change(details.getByLabelText("Executable"), { target: { value: "pnpm" } });
  fireEvent.change(details.getByLabelText("Arguments, one per line"), {
    target: { value: "test" },
  });
  fireEvent.click(details.getByRole("button", { name: "Save milestone" }));
  expect(api.saveMilestone).toHaveBeenCalledExactlyOnceWith(saved.id, null, {
    ...command,
    description: "",
    action: "command",
    timeoutMinutes: 10,
    trigger: "manual",
  });
  expect(await screen.findByRole("button", { name: "Inspect milestone Testing" })).toBeTruthy();
  fireEvent.click(details.getByRole("button", { name: "Run command" }));
  expect(api.runMilestone).toHaveBeenCalledExactlyOnceWith(saved.id, milestone.id);
  expect(await details.findByText("All tests passed.")).toBeTruthy();
  expect(details.getByRole("status").textContent).toBe("Completed");
});

it("saves built-in canvas settings and converts a milestone to a checkpoint", async () => {
  const command = {
    id: "verification",
    title: "Verification",
    timing: "follow-up",
    executable: "pnpm",
    args: ["test"],
    state: "ready",
  } as const;
  const record: WorkflowRecord = {
    ...saved,
    plan: { state: "ready", text: "Update the app." },
    build: { state: "completed", approvedAt: saved.createdAt, summary: "All tasks approved." },
    milestones: [{ ...command, args: [...command.args] }],
  };
  const settings = {
    title: "Implementation",
    description: "Implement approved tasks.",
    expandDetails: "collapsed" as const,
  };
  const configured = { ...record, stageSettings: { build: settings } };
  const checkpoint = {
    id: command.id,
    title: "Verification",
    description: "Review the results.",
    timing: "after-build",
    action: "checkpoint",
    state: "ready",
  } as const;
  const api = fixtureApi([record]);
  vi.mocked(api.saveStageSettings).mockResolvedValue(configured);
  vi.mocked(api.saveMilestone).mockResolvedValue({ ...configured, milestones: [checkpoint] });
  renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: "Inspect Build" }));
  const details = within(screen.getByRole("complementary", { name: "Workflow details" }));
  fireEvent.click(details.getByRole("tab", { name: "Settings" }));
  fireEvent.change(details.getByLabelText("Name"), { target: { value: settings.title } });
  fireEvent.change(details.getByLabelText("Description"), {
    target: { value: settings.description },
  });
  fireEvent.click(details.getByRole("radio", { name: "Collapsed" }));
  fireEvent.click(details.getByRole("button", { name: "Save milestone" }));
  expect(api.saveStageSettings).toHaveBeenCalledExactlyOnceWith(saved.id, "build", settings);
  expect(await screen.findByRole("button", { name: "Inspect Implementation" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Inspect milestone Verification" }));
  fireEvent.click(details.getByRole("tab", { name: "Settings" }));
  fireEvent.click(details.getByRole("radio", { name: "Checkpoint" }));
  fireEvent.click(details.getByRole("radio", { name: "After Build" }));
  fireEvent.change(details.getByLabelText("Description"), {
    target: { value: "Review the results." },
  });
  expect(details.queryByLabelText("Executable")).toBeNull();
  fireEvent.click(details.getByRole("button", { name: "Save milestone" }));
  expect(api.saveMilestone).toHaveBeenCalledExactlyOnceWith(saved.id, command.id, {
    title: "Verification",
    description: "Review the results.",
    timing: "after-build",
    action: "checkpoint",
  });
  expect(await details.findByRole("button", { name: "Approve checkpoint" })).toBeTruthy();
});

it("opens the selected committed file's diff in a separate dialog", async () => {
  const task: WorkflowBuildTask = {
    id: "1",
    title: "Update a card",
    detail: "Persist changes to its title.",
    files: ["src/main.ts"],
    state: "approved",
    attempt: 1,
    revisions: [],
    git: {
      branch: "refs/heads/main",
      base: null,
      review: { files: ["src/main.ts"], tree: "reviewed-tree", subject: "fix: save edits" },
      commit: { hash: "0123456789abcdef", subject: "fix: save edits" },
    },
  };
  const api = fixtureApi([
    {
      ...saved,
      plan: { state: "ready", text: "Fix title saves." },
      build: {
        state: "completed",
        approvedAt: saved.createdAt,
        summary: "All Build tasks approved.",
        tasks: [task],
      },
    },
  ]);
  const patch = "@@ -8 +8 @@\n-save(draft);\n+save(task);\n";
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    "navigator",
    new Proxy(navigator, {
      get(target, property) {
        return property === "clipboard" ? { writeText } : Reflect.get(target, property, target);
      },
    }),
  );
  vi.mocked(api.readBuildCommitDiff).mockResolvedValue(patch);
  renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: "Expand task queue" }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect task 1: Update a card" }));
  const panel = within(screen.getByRole("complementary", { name: "Workflow details" }));
  fireEvent.click(panel.getByRole("button", { name: "Changed files (1)" }));
  fireEvent.click(panel.getByRole("button", { name: "src/main.ts" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Committed file changes" }));
  expect(dialog.getByText("0123456789ab · fix: save edits")).toBeTruthy();
  const diff = await dialog.findByRole("region", { name: "Commit diff" });
  await waitFor(() =>
    expect(diff.querySelector(".diff-row.added code")?.textContent).toBe("save(task);"),
  );
  fireEvent.click(within(diff).getByRole("button", { name: "Copy" }));
  expect(writeText).toHaveBeenCalledExactlyOnceWith(patch);
  expect(api.readBuildCommitDiff).toHaveBeenCalledExactlyOnceWith(saved.id, "1", "src/main.ts");
});

it("shows new provider messages while planning and keeps export available", async () => {
  const api = fixtureApi([saved]);
  const message = {
    sequence: 1,
    runId: "run-1",
    phase: "Plan",
    taskId: null,
    attempt: null,
    createdAt: saved.createdAt,
    kind: "assistant",
    text: "Inspecting the existing setup.",
  } satisfies ProviderTranscriptEntry;
  const run = {
    runId: message.runId,
    phase: message.phase,
    taskId: message.taskId,
    attempt: message.attempt,
    startedAt: saved.createdAt,
  };
  const prompt = "Show cleared payments in the settlement view.";
  vi.mocked(api.readTranscript)
    .mockResolvedValueOnce({
      entries: [
        { ...message, sequence: 1, kind: "user", text: prompt },
        { ...message, sequence: 2 },
      ],
      hasMore: false,
      runs: [{ ...run, status: "running", durationMs: 900 }],
    })
    .mockResolvedValueOnce({
      entries: [{ ...message, sequence: 3, kind: "result", text: "I found the payment view." }],
      hasMore: false,
      runs: [
        { ...run, status: "completed", durationMs: 1250, tokens: { input: 1234, output: 456 } },
      ],
    });
  vi.mocked(api.exportTranscript).mockResolvedValue(false);
  renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: "Inspect Plan" }));
  const panel = within(screen.getByRole("complementary", { name: "Workflow details" }));
  expect(api.readTranscript).not.toHaveBeenCalled();
  fireEvent.click(panel.getByRole("tab", { name: "Activity" }));
  const feed = within(await panel.findByRole("log", { name: "Provider session messages" }));
  expect((await feed.findByText(prompt)).closest("[data-from]")?.getAttribute("data-from")).toBe(
    "self",
  );
  expect(feed.getByText(message.text).closest("[data-from]")?.getAttribute("data-from")).toBe(
    "other",
  );
  expect(feed.getByText("Workflow")).toBeTruthy();
  expect(feed.getByText("Claude Code")).toBeTruthy();
  expect(feed.getByText("Claude Code is working…")).toBeTruthy();
  const timing = within(panel.getByRole("region", { name: "Provider call durations" }));
  expect(timing.getByText("Running · 900 ms")).toBeTruthy();
  expect(feed.getByText(message.text)).toBeTruthy();
  expect(await feed.findByText("I found the payment view.", {}, { timeout: 2500 })).toBeTruthy();
  expect(feed.getByText("Result")).toBeTruthy();
  expect(timing.getByText("Completed · 1.3 s")).toBeTruthy();
  expect(timing.getByText("1,234 input tokens")).toBeTruthy();
  expect(timing.getByText("456 output tokens")).toBeTruthy();
  expect(api.readTranscript).toHaveBeenNthCalledWith(1, saved.id, 0);
  expect(api.readTranscript).toHaveBeenNthCalledWith(2, saved.id, 2);
  fireEvent.click(panel.getByRole("button", { name: "Export provider transcript" }));
  expect(api.exportTranscript).toHaveBeenCalledExactlyOnceWith(saved.id);
  fireEvent.click(panel.getByRole("tab", { name: "Overview" }));
  expect(panel.queryByRole("log", { name: "Provider session messages" })).toBeNull();
});

it("shows the tightest provider quota in the workflow header and opens all windows", async () => {
  const api = fixtureApi([saved]);
  vi.mocked(api.providerQuota).mockResolvedValue({
    checkedAt: Date.now(),
    windows: [
      { label: "5-hour", usedPercent: 25, resetsAt: null },
      { label: "7-day", usedPercent: 86, resetsAt: Date.now() + 3_600_000 },
    ],
  });
  renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: "Quota · 14% left" }));
  const quota = within(await screen.findByRole("dialog", { name: "Claude Code quota" }));
  expect(
    quota.getByRole("progressbar", { name: "5-hour used" }).getAttribute("aria-valuenow"),
  ).toBe("25");
  expect(quota.getByText("75% left")).toBeTruthy();
  expect(quota.getByText("14% left")).toBeTruthy();
  expect(quota.getByText(/^Resets /)).toBeTruthy();
});

it("creates a canvas note and opens it for configuration", async () => {
  const record: WorkflowRecord = { ...saved, plan: { state: "ready", text: "Review the scope." } };
  const note = {
    id: "note-1",
    source: "note",
    title: "Open questions",
    notes: "Who owns rollout?",
  };
  const api = fixtureApi([record]);
  vi.mocked(api.editWorkflowSection).mockResolvedValue({
    ...record,
    stageSettings: { plan: { sections: [note] } },
  });
  renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: "Inspect Plan" }));
  expect(screen.getByRole("button", { name: "Collapse Plan" }).getAttribute("aria-expanded")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add detail" }));
  const inspector = within(screen.getByRole("complementary", { name: "Workflow details" }));
  fireEvent.change(inspector.getByRole("textbox", { name: "Name" }), {
    target: { value: note.title },
  });
  fireEvent.change(inspector.getByRole("textbox", { name: "Notes" }), {
    target: { value: note.notes },
  });
  fireEvent.click(inspector.getByRole("button", { name: "Save detail" }));
  expect(api.editWorkflowSection).toHaveBeenCalledExactlyOnceWith(record.id, "plan", {
    action: "save",
    id: null,
    input: { source: note.source, title: note.title, notes: note.notes },
  });
  expect(await inspector.findByText(note.notes)).toBeTruthy();
  expect(screen.getByRole("button", { name: note.title, pressed: true })).toBeTruthy();
  fireEvent.click(inspector.getByRole("tab", { name: "Settings" }));
  expect(inspector.getByRole("textbox", { name: "Name" })).toHaveProperty("value", note.title);
  expect(inspector.getByRole("button", { name: "Remove detail" })).toBeTruthy();
});

it("changes the canvas layout without losing the current selection and restores the style", async () => {
  const api = fixtureApi([{ ...saved, plan: { state: "ready", text: "Review the scope." } }]);
  const first = renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: "Inspect Plan" }));
  const canvas = screen.getByRole("region", { name: "Workflow canvas" });
  const styles = within(within(canvas).getByRole("radiogroup", { name: "Canvas style" }));
  const planNode = canvas.querySelector<HTMLElement>('.react-flow__node[data-id="plan"]');
  expect(planNode?.style.transform).toMatch(/translate\(256px(?:,\s*0px)?\)/);
  fireEvent.click(styles.getByRole("radio", { name: "Timeline" }));
  expect(canvas.getAttribute("data-canvas-style")).toBe("timeline");
  expect(planNode?.style.transform).toMatch(/translate\(0px,\s*\d+px\)/);
  expect(screen.getByRole("button", { name: "Inspect Plan", pressed: true })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Scope" })).toBeTruthy();

  fireEvent.click(styles.getByRole("radio", { name: "Compact" }));
  expect(canvas.getAttribute("data-canvas-style")).toBe("compact");
  expect(localStorage.getItem(canvasStyleStorageKey)).toBe("compact");
  first.unmount();

  renderApp(api);
  const reloaded = await screen.findByRole("region", { name: "Workflow canvas" });
  expect(reloaded.getAttribute("data-canvas-style")).toBe("compact");
  expect(within(reloaded).getByRole("radio", { name: "Compact", checked: true })).toBeTruthy();
});

it("opens the selected workflow workspace in Cursor", async () => {
  const other = {
    ...saved,
    id: "workflow-2",
    request: "Other workspace",
    workspacePath: "/workspaces/other",
  };
  const api = fixtureApi([saved, other]);
  renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: /^Other workspace/ }));
  fireEvent.click(screen.getByRole("button", { name: "Open in Cursor" }));
  expect(api.openWorkspaceInCursor).toHaveBeenCalledExactlyOnceWith(other.id);
});

it("shows files for the initial Git commit and starts Build after confirmation", async () => {
  const api = fixtureApi([
    {
      ...saved,
      plan: { state: "ready", text: "Update the existing app." },
      build: {
        state: "failed",
        message:
          "Review the existing files and create an initial Git commit before starting Build.",
        approvedAt: saved.createdAt,
        baselineFiles: ["README.md", "src/main.ts"],
      },
    },
  ]);
  renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: "Inspect Build" }));
  const panel = within(screen.getByRole("complementary", { name: "Workflow details" }));
  expect(panel.getByText("README.md")).toBeTruthy();
  expect(panel.getByText("src/main.ts")).toBeTruthy();
  expect(api.startBuild).not.toHaveBeenCalled();
  fireEvent.click(panel.getByRole("button", { name: "Commit existing files and start Build" }));
  expect(api.startBuild).toHaveBeenCalledExactlyOnceWith(saved.id, true);
});

it("starts a fresh replay with the selected provider and model", async () => {
  const original = {
    ...saved,
    plan: { state: "ready", text: "Original plan" },
  } satisfies WorkflowRecord;
  const api = fixtureApi([original]);
  vi.mocked(api.planningOptions).mockResolvedValue({
    models: [{ id: "test-model", name: "Test model", efforts: [{ id: "high" }] }],
    skills: [],
  });
  vi.mocked(api.replayPlan).mockResolvedValue({
    ...saved,
    id: "fresh-plan",
    request: "Fresh plan",
    provider: "codex",
  });
  renderApp(api);
  fireEvent.click(await screen.findByRole("button", { name: "Inspect Plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Open plan review" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Review plan" }));
  fireEvent.click(dialog.getByRole("button", { name: "Replay plan" }));
  expect(dialog.getByRole("textbox", { name: "What should change?" })).toBeTruthy();
  await chooseOption("Replay mode", "Start from scratch");
  await chooseOption("Planning provider", "Codex");
  await chooseOption("Model", "Test model");
  await chooseOption("Effort", "high");
  fireEvent.click(dialog.getByRole("button", { name: "Start fresh plan" }));
  expect(api.replayPlan).toHaveBeenCalledExactlyOnceWith(saved.id, {
    mode: "fresh",
    provider: "codex",
    customPlan: { model: "test-model", effort: "high", skillIds: [] },
  });
  expect(await dialog.findByText("Codex is preparing a plan.")).toBeTruthy();
});

it("labels cached Jira data and keeps it visible when a manual sync fails", async () => {
  const api = fixtureApi();
  const cached = jiraResponse([issue], "cache");
  vi.mocked(api.assignedSprintIssues)
    .mockResolvedValueOnce(cached)
    .mockResolvedValueOnce({ ...cached, syncError: "Jira is offline" })
    .mockResolvedValueOnce(jiraResponse([issue]));
  vi.mocked(api.issue).mockResolvedValueOnce(jiraResponse(issue, "cache"));
  renderApp(api);
  const wizard = within(await openWorkflowWizard());
  await wizard.findByText(/Issues · Local cache · Last synced/);
  expect(api.assignedSprintIssues).toHaveBeenCalledExactlyOnceWith(false);
  fireEvent.click(wizard.getByRole("button", { name: "Sync" }));
  await wizard.findByText("Sync failed. Showing cached data.");
  expect(wizard.getByText(/Issues · Local cache · Last synced/)).toBeTruthy();

  await chooseOption("Issue", /FIN-5546/);
  await wizard.findByText(/Issue details · Local cache · Last synced/);
  fireEvent.click(wizard.getByRole("button", { name: "Sync" }));
  await wizard.findByText(/Issues · Live Jira data · Last synced/);
  expect(api.assignedSprintIssues).toHaveBeenNthCalledWith(3, true);
  expect(api.issue).toHaveBeenNthCalledWith(2, issue.key, true);
  expect(wizard.queryByText("Sync failed. Showing cached data.")).toBeNull();
});

it("can load Jira issues before the desktop process and renderer finish reloading together", async () => {
  const api = fixtureApi();
  vi.mocked(api.assignedSprintIssues)
    .mockResolvedValueOnce([issue] as unknown as JiraResponse<WorkItem[]>)
    .mockResolvedValueOnce(jiraResponse([issue]));
  vi.mocked(api.issue).mockResolvedValueOnce(issue as unknown as JiraResponse<WorkItem>);
  renderApp(api);

  const wizard = within(await openWorkflowWizard());
  await chooseOption("Issue", /FIN-5546/);
  await wizard.findByText(issue.description);
  fireEvent.click(wizard.getByRole("button", { name: "Sync" }));
  await waitFor(() => expect(api.assignedSprintIssues).toHaveBeenNthCalledWith(2, true));
  await wizard.findByRole("button", { name: "Sync" });
  expect(wizard.getByText(issue.description)).toBeTruthy();
});

async function openWorkspaceStep() {
  const button = await screen.findByRole<HTMLButtonElement>("button", { name: "New workflow" });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
  return screen.findByRole("dialog", { name: "Choose a workspace" });
}

async function openWorkflowWizard() {
  const workspace = within(await openWorkspaceStep());
  const next = workspace.getByRole<HTMLButtonElement>("button", { name: "Continue to Jira" });
  await waitFor(() => expect(next.disabled).toBe(false));
  fireEvent.click(next);
  return screen.findByRole("dialog", { name: "Start from Jira" });
}

async function chooseOption(label: string, option: string | RegExp) {
  const field = await screen.findByRole<HTMLInputElement>("combobox", { name: label });
  await waitFor(() => expect(field.disabled).toBe(false));
  fireEvent.click(field);
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

it("starts planning from an editable sample issue without loading Jira", async () => {
  const api = fixtureApi();
  renderApp(api);
  const workspace = within(await openWorkspaceStep());
  const simulate = workspace.getByRole<HTMLButtonElement>("button", { name: "Simulate issue" });
  await waitFor(() => expect(simulate.disabled).toBe(false));
  fireEvent.click(simulate);
  const simulated = within(await screen.findByRole("dialog", { name: "Simulate issue" }));
  expect(simulated.getByRole<HTMLInputElement>("textbox", { name: "Issue title" }).value).toContain(
    "Scaffold Pocket Tasks",
  );
  fireEvent.change(simulated.getByRole("textbox", { name: "Issue details" }), {
    target: { value: "Scaffold the tracker in the selected workspace." },
  });
  fireEvent.click(simulated.getByRole("button", { name: "Start Plan" }));
  expect(api.create).toHaveBeenCalledExactlyOnceWith({
    simulatedIssue: {
      title: "Scaffold Pocket Tasks, a personal task tracker",
      description: "Scaffold the tracker in the selected workspace.",
    },
    workspacePath: saved.workspacePath,
    provider: "codex",
  });
  expect(api.assignedSprintIssues).not.toHaveBeenCalled();
  expect(api.issue).not.toHaveBeenCalled();
  expect(await screen.findByRole("dialog", { name: "Review plan" })).toBeTruthy();
});

it.each([
  ["Edit", "Retrieve the selected task by its stable ID"],
  ["Delete", "remove only the selected task by ID"],
])("starts the incremental %s scenario from the existing workspace", async (action, criterion) => {
  const api = fixtureApi();
  renderApp(api);
  const workspace = within(await openWorkspaceStep());
  const simulate = workspace.getByRole<HTMLButtonElement>("button", { name: "Simulate issue" });
  await waitFor(() => expect(simulate.disabled).toBe(false));
  fireEvent.click(simulate);
  const simulated = within(await screen.findByRole("dialog", { name: "Simulate issue" }));
  await chooseOption("Scenario", `${action} an existing task`);
  const title = `${action} an existing task in Pocket Tasks`;
  expect(simulated.getByRole<HTMLInputElement>("textbox", { name: "Issue title" }).value).toBe(
    title,
  );
  const details = simulated.getByRole<HTMLTextAreaElement>("textbox", { name: "Issue details" });
  expect(details.value).toContain(criterion);
  const description = details.value + "\nKeep the current layout.";
  fireEvent.change(details, { target: { value: description } });
  fireEvent.click(simulated.getByRole("button", { name: "Start Plan" }));
  expect(api.create).toHaveBeenCalledExactlyOnceWith({
    simulatedIssue: { title, description },
    workspacePath: saved.workspacePath,
    provider: "codex",
  });
  expect(api.assignedSprintIssues).not.toHaveBeenCalled();
});

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

it("selects a workspace before loading Jira and reuses the folder in the next wizard", async () => {
  const api = fixtureApi();
  vi.mocked(api.restoreWorkspace).mockRejectedValueOnce(
    new Error("The workspace folder is unavailable. Choose it again."),
  );
  renderApp(api);

  const workspace = within(await openWorkspaceStep());
  expect(
    workspace.getByRole<HTMLButtonElement>("button", { name: "Continue to Jira" }).disabled,
  ).toBe(true);
  await workspace.findByText("The workspace folder is unavailable. Choose it again.");
  expect(api.assignedSprintIssues).not.toHaveBeenCalled();
  fireEvent.click(workspace.getByRole("button", { name: "Choose folder" }));
  await workspace.findByText(saved.workspacePath);
  expect(api.assignedSprintIssues).not.toHaveBeenCalled();
  fireEvent.click(workspace.getByRole("button", { name: "Continue to Jira" }));

  const jira = within(await screen.findByRole("dialog", { name: "Start from Jira" }));
  await chooseOption("Issue", /FIN-5546/);
  await jira.findByText(issue.description);
  expect(jira.queryByRole("button", { name: "Change folder" })).toBeNull();
  fireEvent.click(jira.getByRole("button", { name: "Back" }));
  const previous = within(await screen.findByRole("dialog", { name: "Choose a workspace" }));
  expect(previous.getByText(saved.workspacePath)).toBeTruthy();
  fireEvent.click(previous.getByRole("button", { name: "Cancel" }));

  const reopened = within(await openWorkspaceStep());
  await reopened.findByText(saved.workspacePath);
  expect(
    reopened.getByRole<HTMLButtonElement>("button", { name: "Continue to Jira" }).disabled,
  ).toBe(false);
  expect(api.chooseWorkspace).toHaveBeenCalledOnce();
  expect(api.restoreWorkspace).toHaveBeenCalledTimes(2);
});

it("starts a custom plan with the selected model, effort, and installed skill", async () => {
  const api = fixtureApi();
  const skill = { id: "/skills/review/SKILL.md", name: "Review requirements" };
  vi.mocked(api.planningOptions).mockResolvedValue({
    models: [
      { id: "fixture-model", name: "Fixture model", efforts: [{ id: "high" }] },
      { id: "fast-model", name: "Fast model", efforts: [{ id: "low" }] },
    ],
    skills: [skill],
  });
  renderApp(api);
  const wizard = await openWorkflowWizard();
  await chooseOption("Issue", /FIN-5546/);
  await screen.findByText(issue.description);
  expect(api.planningOptions).not.toHaveBeenCalled();
  const settings = within(wizard).getByRole("button", { name: "Custom Plan Settings (optional)" });
  expect(settings.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(settings);
  const checkbox = await within(wizard).findByRole("checkbox", { name: skill.name });
  expect(api.planningOptions).toHaveBeenCalledExactlyOnceWith("codex", saved.workspacePath);
  expect(api.create).not.toHaveBeenCalled();
  fireEvent.click(checkbox);
  await chooseOption("Model", "Fast model");
  await chooseOption("Effort", "Low");
  await chooseOption("Model", "Fixture model");
  const effort = within(wizard).getByRole<HTMLInputElement>("combobox", { name: "Effort" });
  expect(effort.value).toBe("Provider default");
  fireEvent.click(effort);
  const high = await screen.findByRole("option", { name: "High" });
  expect(screen.queryByRole("option", { name: "Low" })).toBeNull();
  fireEvent.click(high);
  fireEvent.click(settings);
  fireEvent.click(within(wizard).getByRole("button", { name: "Start Plan Custom" }));
  expect(api.planningOptions).toHaveBeenCalledTimes(1);
  expect(api.create).toHaveBeenCalledExactlyOnceWith({
    issueKey: issue.key,
    provider: "codex",
    workspacePath: saved.workspacePath,
    customPlan: { model: "fixture-model", effort: "high", skillIds: [skill.id] },
  });
  await within(screen.getByRole("complementary", { name: "Saved workflows" })).findByText(
    saved.request,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem("agent-desktop.default-provider");
  localStorage.removeItem("agent-desktop.mascot-design");
  localStorage.removeItem(canvasStyleStorageKey);
});

it("loads active sprint work, shows the issue, and starts the selected provider's plan", async () => {
  const api = fixtureApi();
  vi.mocked(api.knowledge.list).mockResolvedValue([
    {
      id: "note-1",
      area: "Finance",
      title: "Ledger rules",
      bodyHtml: "<p>Settlement rules</p>",
      bodyText: "Settlement rules",
      paths: ["src/finance.ts"],
    },
    {
      id: "note-2",
      area: "Operations",
      title: "Monitoring",
      bodyHtml: "<p>On-call guide</p>",
      bodyText: "On-call guide",
      paths: [],
    },
    {
      id: "note-3",
      area: "Finance",
      title: "Invoice schedules",
      bodyHtml: "<p>Billing calendar</p>",
      bodyText: "Billing calendar",
      paths: [],
    },
  ]);
  renderApp(api);
  expect(api.assignedSprintIssues).not.toHaveBeenCalled();
  const wizard = await openWorkflowWizard();
  const start = within(wizard).getByRole<HTMLButtonElement>("button", { name: "Start Plan" });
  expect(start.disabled).toBe(true);
  await chooseOption("Issue", /FIN-5546/);
  expect(api.assignedSprintIssues).toHaveBeenCalledOnce();
  expect(api.boards).not.toHaveBeenCalled();
  await screen.findByText(issue.description);
  await chooseOption("Issue", "Clear issue");
  expect(screen.queryByText(issue.description)).toBeNull();

  await chooseOption("Show issues", "Browse by board");
  expect(screen.queryByText(issue.description)).toBeNull();
  await chooseOption("Jira board", "Finance");
  await chooseOption("Active sprint", "Current sprint");
  await chooseOption("Issue", /FIN-5546/);
  await screen.findByText(issue.description);
  expect(start.disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Company Knowledge (optional)" }));
  const selectAll = screen.getByRole("checkbox", { name: "Select all notes" });
  const finance = screen.getByRole("checkbox", { name: "Finance" });
  const monitoringArea = screen.getByRole("checkbox", { name: "Operations" });
  const expandFinance = screen.getByRole("button", { name: "Expand Finance" });
  expect(expandFinance.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("checkbox", { name: "Ledger rules" })).toBeNull();
  fireEvent.click(finance);
  expect(finance.getAttribute("aria-checked")).toBe("true");
  expect(expandFinance.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(expandFinance);
  const ledger = screen.getByRole("checkbox", { name: "Ledger rules" });
  const invoices = screen.getByRole("checkbox", { name: "Invoice schedules" });
  expect(ledger.getAttribute("aria-checked")).toBe("true");
  expect(invoices.getAttribute("aria-checked")).toBe("true");
  expect(monitoringArea.getAttribute("aria-checked")).toBe("false");
  expect(screen.queryByRole("checkbox", { name: "Monitoring" })).toBeNull();
  expect(selectAll.getAttribute("aria-checked")).toBe("mixed");
  fireEvent.click(selectAll);
  expect(monitoringArea.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(selectAll);
  expect(ledger.getAttribute("aria-checked")).toBe("false");
  expect(invoices.getAttribute("aria-checked")).toBe("false");
  expect(monitoringArea.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(ledger);
  fireEvent.click(screen.getByRole("button", { name: "Collapse Finance" }));
  expect(screen.queryByRole("checkbox", { name: "Ledger rules" })).toBeNull();
  expect(finance.getAttribute("aria-checked")).toBe("mixed");
  expect(screen.getByText("1 of 2 selected")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Company Knowledge (1 selected)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
  fireEvent.click(start);

  const review = within(await screen.findByRole("dialog", { name: "Review plan" }));
  expect(review.getByText(/Step 3 of 3/)).toBeTruthy();
  expect(review.getByText("Claude Code is preparing a plan.")).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: "Start from Jira" })).toBeNull();
  expect(api.create).toHaveBeenCalledWith({
    issueKey: issue.key,
    provider: saved.provider,
    workspacePath: saved.workspacePath,
    knowledgeNoteIds: ["note-1"],
  });
});

it("continues planning with a reply in Step 3 and shows the structured review", async () => {
  const api = fixtureApi();
  const question = "Which payments should the plan cover?";
  const answer = "Cover cleared payments.";
  const proposal = "Show the settlement state in the payments table.";
  const clarification = { questions: question, answer };
  vi.mocked(api.list)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ ...saved, plan: { state: "needs-input", text: question } }])
    .mockResolvedValue([
      {
        ...saved,
        plan: {
          state: "ready",
          text: "Keep the existing payment permissions.",
          clarifications: [clarification],
          review: {
            proposal,
            findings: ["The payments table already filters by settlement state."],
            considerations: ["Keep the existing access checks."],
            steps: [
              {
                title: "Render settlement state",
                detail: "Update the table cell.",
                files: ["src/payments.ts"],
              },
            ],
            files: [
              {
                path: "src/payments.ts",
                action: "update",
                summary: "Show the settlement state.",
                diff: "@@ -12 +20 @@\n-return payment.status;\n+return payment.settlementState;",
              },
            ],
            reproduction: ["Open the payments table."],
            verification: ["Check that cleared payments show their settlement state."],
          },
        },
      },
    ]);
  vi.mocked(api.answerPlan).mockResolvedValue({
    ...saved,
    plan: { state: "running", clarifications: [clarification] },
  });
  renderApp(api);
  await openWorkflowWizard();
  await chooseOption("Issue", /FIN-5546/);
  await screen.findByText(issue.description);
  fireEvent.click(screen.getByRole("button", { name: "Start Plan" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Review plan" }));

  expect(await dialog.findByText(question, {}, { timeout: 3000 })).toBeTruthy();
  fireEvent.change(dialog.getByRole("textbox", { name: "Your answers" }), {
    target: { value: answer },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Continue planning" }));
  expect(api.answerPlan).toHaveBeenCalledExactlyOnceWith(saved.id, answer);
  expect(await dialog.findByText(proposal, {}, { timeout: 3000 })).toBeTruthy();
  expect(dialog.getByRole("heading", { name: "Implementation steps" })).toBeTruthy();
  const fileChange = dialog.getByRole("button", { name: /Update src\/payments.ts/ });
  expect(fileChange.getAttribute("aria-expanded")).toBe("true");
  const diff = await dialog.findByRole("region", { name: "Proposed diff" });
  await waitFor(() =>
    expect([...diff.querySelectorAll("code")].map(({ textContent }) => textContent)).toEqual([
      "@@ -12 +20 @@",
      "return payment.status;",
      "return payment.settlementState;",
    ]),
  );
  expect(diff.querySelector(".diff-row.deleted .diff-line-number")?.textContent).toBe("12");
  expect(diff.querySelector(".diff-row.added .diff-line-number:nth-child(2)")?.textContent).toBe(
    "20",
  );
  await waitFor(() =>
    expect(diff.querySelector(".diff-row.added .token.keyword")?.textContent).toBe("return"),
  );
  expect(within(diff).getByRole("button", { name: "Copy" })).toBeTruthy();
  fireEvent.click(fileChange);
  expect(fileChange.getAttribute("aria-expanded")).toBe("false");
  expect(dialog.getByText("Check that cleared payments show their settlement state.")).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Return to workflow" }));
  expect(screen.queryByRole("dialog", { name: "Review plan" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open plan review" }));
  const reopened = within(await screen.findByRole("dialog", { name: "Review plan" }));
  expect(reopened.getByText(proposal)).toBeTruthy();
  fireEvent.click(reopened.getByRole("button", { name: "Approve plan and continue to Build" }));
  const details = within(screen.getByRole("complementary", { name: "Workflow details" }));
  fireEvent.click(await details.findByRole("button", { name: "Start Build" }));
  expect(api.approvePlan).toHaveBeenCalledExactlyOnceWith(saved.id);
  expect(api.startBuild).toHaveBeenCalledExactlyOnceWith(saved.id);
  expect(await details.findByText("Implemented the tasks.")).toBeTruthy();
});

it("removes a workflow from history only after explicit confirmation", async () => {
  const other = { ...saved, id: "workflow-2", request: "Next workflow", plan: undefined };
  const api = fixtureApi([{ ...saved, plan: { state: "ready", text: "Draft" } }, other]);
  renderApp(api);
  const history = within(screen.getByRole("complementary", { name: "Saved workflows" }));
  const trash = await history.findByRole("button", { name: `Delete workflow: ${saved.request}` });
  fireEvent.click(trash);
  const dialog = within(await screen.findByRole("dialog", { name: "Delete workflow?" }));
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(api.removeWorkflow).not.toHaveBeenCalled();
  fireEvent.click(trash);
  const reopened = within(await screen.findByRole("dialog", { name: "Delete workflow?" }));
  fireEvent.click(reopened.getByRole("button", { name: "Permanently delete" }));
  await waitFor(() => expect(trash.isConnected).toBe(false));
  expect(api.removeWorkflow).toHaveBeenCalledExactlyOnceWith(saved.id);
  expect(history.getByRole("button", { name: /^Next workflow/ }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(screen.getByRole("region", { name: "Workflow canvas" })).toBeTruthy();

  fireEvent.click(history.getByRole("button", { name: "Delete workflow: Next workflow" }));
  const last = within(await screen.findByRole("dialog", { name: "Delete workflow?" }));
  fireEvent.click(last.getByRole("button", { name: "Permanently delete" }));
  const onboarding = await screen.findByRole("region", { name: "Workflow onboarding" });
  expect(within(onboarding).getByRole("button", { name: "New workflow" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Workflow canvas" })).toBeNull();
});

it("opens each Build task in its own node and submits feedback for the chosen attempt", async () => {
  const task: WorkflowBuildTask = {
    id: "1",
    title: "Scaffold app",
    detail: "Create the entry point.",
    files: ["src/main.ts"],
    state: "review",
    attempt: 1,
    summary: "Added the entry point.",
    revisions: [],
  };
  const next: WorkflowBuildTask = {
    id: "2",
    title: "Add local storage",
    detail: "Keep tasks after reload.",
    files: ["src/storage.ts"],
    state: "queued",
    attempt: 0,
    revisions: [],
  };
  const workflow: WorkflowRecord = {
    ...saved,
    plan: { state: "ready", text: "Build a tracker." },
    build: { state: "review", approvedAt: saved.createdAt, tasks: [task, next] },
  };
  const api = fixtureApi([workflow]);
  const feedback = "Use a visible label.";
  vi.mocked(api.reviewBuildTask)
    .mockResolvedValueOnce({
      ...workflow,
      build: {
        state: "review",
        approvedAt: saved.createdAt,
        tasks: [
          {
            ...task,
            attempt: 2,
            summary: "Added a visible label.",
            revisions: [{ summary: task.summary ?? "", feedback }],
            git: {
              branch: "refs/heads/main",
              base: null,
              review: {
                tree: "reviewed-tree",
                files: ["src/main.ts"],
                subject: "feat: scaffold the app",
              },
            },
          },
          next,
        ],
      },
    })
    .mockResolvedValueOnce({
      ...workflow,
      build: {
        state: "review",
        approvedAt: saved.createdAt,
        tasks: [
          { ...task, state: "approved", attempt: 2 },
          { ...next, state: "review", attempt: 1, summary: "Saved tasks locally." },
        ],
      },
    });
  renderApp(api);
  expect(await screen.findByRole("button", { name: "Inspect task queue" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Inspect task 2: Add local storage" })).toBeNull();
  const canvas = screen.getByRole("region", { name: "Workflow canvas" });
  const buildDetails = [...canvas.querySelectorAll('[data-id^="build:"]')].filter(
    (node) => !node.matches('[data-id^="build:task-"]'),
  );
  expect(buildDetails.slice(-3).map((node) => node.getAttribute("data-id"))).toEqual([
    "build:summary",
    "build:queue",
    "build:new",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Inspect task queue" }));
  const queue = within(screen.getByRole("complementary", { name: "Workflow details" }));
  expect(queue.getByRole("heading", { name: "Task queue" })).toBeTruthy();
  expect(queue.getByRole("button", { name: "Open task 2: Add local storage" })).toBeTruthy();
  const nextNode = await screen.findByRole("button", { name: "Inspect task 2: Add local storage" });
  expect(nextNode.closest(".workflow-task")?.getAttribute("data-kind")).toBe("waiting");
  fireEvent.click(nextNode);
  const panel = within(screen.getByRole("complementary", { name: "Workflow details" }));
  expect(panel.getByRole("heading", { name: "2. Add local storage" })).toBeTruthy();
  expect(panel.getByRole("status").textContent).toBe("Queued");
  expect(panel.getByText("Keep tasks after reload.")).toBeTruthy();
  expect(panel.queryByRole("button", { name: "Approve task" })).toBeNull();
  const firstNode = screen.getByRole("button", { name: "Inspect task 1: Scaffold app" });
  expect(firstNode.closest(".workflow-task")?.getAttribute("data-kind")).toBe("review");
  fireEvent.click(firstNode);
  expect(panel.getByRole("heading", { name: "1. Scaffold app" })).toBeTruthy();
  expect(panel.getByRole("status").textContent).toBe("Needs review");
  expect(panel.queryByText("Keep tasks after reload.")).toBeNull();
  fireEvent.click(panel.getByRole("button", { name: "Request changes" }));
  fireEvent.change(panel.getByRole("textbox", { name: "Requested changes" }), {
    target: { value: feedback },
  });
  fireEvent.click(panel.getByRole("button", { name: "Send changes" }));
  await panel.findByText("Added a visible label.");
  expect(api.reviewBuildTask).toHaveBeenNthCalledWith(1, saved.id, {
    taskId: "1",
    attempt: 1,
    feedback,
  });
  const commitSubject = panel.getByRole("textbox", { name: "Commit subject" }) as HTMLInputElement;
  expect(commitSubject.value).toBe("feat: scaffold the app");
  fireEvent.change(commitSubject, { target: { value: "fix: add a visible task label" } });
  fireEvent.click(panel.getByRole("button", { name: "Approve task" }));
  await panel.findByText("Saved tasks locally.");
  expect(api.reviewBuildTask).toHaveBeenNthCalledWith(2, saved.id, {
    taskId: "1",
    attempt: 2,
    commitSubject: "fix: add a visible task label",
  });
  expect(panel.getByText("1 of 2 tasks approved")).toBeTruthy();
  expect(firstNode.closest(".workflow-task")?.getAttribute("data-kind")).toBe("saved");
  expect(nextNode.closest(".workflow-task")?.getAttribute("data-kind")).toBe("review");
});

it("shows the selected Plan section when clicking the canvas and resets inspector scroll", async () => {
  const api = fixtureApi([
    {
      ...saved,
      plan: {
        state: "ready",
        text: "Full plan text.",
        review: {
          proposal: "Add settlement status to the payment view.",
          findings: [],
          considerations: ["Keep the existing permissions."],
          steps: [],
          files: [],
          reproduction: [],
          verification: [],
        },
      },
    },
  ]);
  renderApp(api);
  const plan = await screen.findByRole("button", { name: "Inspect Plan" });
  const canvasNode = plan.closest(".workflow-node");
  expect(canvasNode).toBeTruthy();
  fireEvent.click(within(canvasNode as HTMLElement).getByText("Draft ready"));
  const inspector = screen.getByRole("complementary", { name: "Workflow details" });
  const panel = within(inspector);
  expect(panel.getByText("Full plan text.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Collapse Plan" }).getAttribute("aria-expanded")).toBe(
    "true",
  );
  inspector.scrollTop = 120;
  fireEvent.click(screen.getByRole("button", { name: "Scope" }));
  expect(panel.getByRole("heading", { name: "Scope" })).toBeTruthy();
  expect(panel.getByText("Add settlement status to the payment view.")).toBeTruthy();
  expect(panel.queryByText("Full plan text.")).toBeNull();
  expect(inspector.scrollTop).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Risks and assumptions" }));
  expect(panel.getByText("Keep the existing permissions.")).toBeTruthy();
  expect(panel.queryByText("Add settlement status to the payment view.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Hide details", expanded: true }));
  expect(screen.queryByRole("complementary", { name: "Workflow details" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Scope" }));
  fireEvent.click(screen.getByRole("button", { name: "Show details", expanded: false }));
  expect(panel.getByRole("heading", { name: "Scope" })).toBeTruthy();
});

it("reopens saved history and keeps Build blocked while the plan is unavailable", async () => {
  const api = fixtureApi([
    { ...saved, plan: { state: "ready", text: "Review the payment display." } },
  ]);
  renderApp(api);

  const history = within(screen.getByRole("complementary", { name: "Saved workflows" }));
  const previous = await history.findByRole("button", { name: /^FIN-5546/ });
  const wizard = await openWorkflowWizard();
  expect(previous.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(within(wizard).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog", { name: "Start from Jira" })).toBeNull();
  expect(previous.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Inspect Plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Open plan review" }));
  const review = within(await screen.findByRole("dialog", { name: "Review plan" }));
  expect(review.getByText("Review the payment display.")).toBeTruthy();
  expect(review.getByRole("button", { name: "Generate structured review" })).toBeTruthy();
  fireEvent.click(review.getByRole("button", { name: "Return to workflow" }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect Build" }));

  const details = within(screen.getByRole("complementary", { name: "Workflow details" }));
  expect(details.getByRole("heading", { name: "Build" })).toBeTruthy();
  expect(details.getByText("Blocked")).toBeTruthy();
  expect(
    details.getByText("Build requires an approved plan. No execution has started."),
  ).toBeTruthy();
});

it("keeps Jira and workspace selections when visiting Company Knowledge from the wizard", async () => {
  const api = fixtureApi();
  renderApp(api);
  const wizard = await openWorkflowWizard();
  await chooseOption("Issue", /FIN-5546/);
  await within(wizard).findByText(issue.description);
  fireEvent.click(within(wizard).getByRole("button", { name: "Company Knowledge (optional)" }));
  fireEvent.click(within(wizard).getByRole("button", { name: "Open Company Knowledge" }));
  await screen.findByRole("heading", { name: "Company Knowledge", level: 1 });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Start from Jira" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Back to workflows" }));
  const reopened = within(await screen.findByRole("dialog", { name: "Start from Jira" }));
  expect(reopened.getByText(`Workspace: ${saved.workspacePath}`)).toBeTruthy();
  expect(reopened.getByText(issue.description)).toBeTruthy();
  expect(reopened.getByRole<HTMLButtonElement>("button", { name: "Start Plan" }).disabled).toBe(
    false,
  );
});

it("accepts a planning reply and keeps it available if sending fails", async () => {
  const questions = "Should the plan include closed periods?";
  const api = fixtureApi([{ ...saved, plan: { state: "needs-input", text: questions } }]);
  vi.mocked(api.answerPlan)
    .mockRejectedValueOnce(new Error("The workspace is unavailable."))
    .mockResolvedValueOnce(saved);
  renderApp(api);
  await screen.findByRole("button", { name: /^FIN-5546/ });
  fireEvent.click(screen.getByRole("button", { name: "Inspect Plan" }));
  expect(screen.getByText(questions)).toBeTruthy();
  const reply = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Your answers" });
  const send = screen.getByRole<HTMLButtonElement>("button", { name: "Continue planning" });
  expect(send.disabled).toBe(true);
  fireEvent.change(reply, { target: { value: "  Show open periods only.  " } });
  fireEvent.click(send);
  await screen.findByText("The workspace is unavailable.");
  expect(reply.value).toBe("  Show open periods only.  ");
  fireEvent.click(send);
  await screen.findByText("Claude Code is preparing a plan.");
  expect(api.answerPlan).toHaveBeenLastCalledWith(saved.id, "Show open periods only.");
});

it("previews Once UI styles, restores them on reload, and resets to the app defaults", async () => {
  const api = fixtureApi();
  const root = document.documentElement;
  const original = new Map(
    root.getAttributeNames().map((name) => [name, root.getAttribute(name)!]),
  );
  const openAppearance = () => {
    const view = render(
      <ThemeProvider {...onceUIStyle} persistence="local">
        <LayoutProvider>
          <ToastProvider>
            <App desktop={desktop} api={api} />
          </ToastProvider>
        </LayoutProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    return view;
  };

  try {
    const first = openAppearance();
    const brand = screen.getByRole("combobox", { name: "Brand" });
    fireEvent.click(brand);
    fireEvent.click(await screen.findByRole("option", { name: "Emerald" }));
    expect(root.getAttribute("data-brand")).toBe("emerald");
    expect(localStorage.getItem("data-brand")).toBe("emerald");
    fireEvent.click(screen.getByRole("radio", { name: "Dark theme" }));
    expect(root.getAttribute("data-theme")).toBe("dark");
    const invert = screen.getByRole("button", { name: "Invert preview" });
    fireEvent.click(invert);
    expect(invert.getAttribute("aria-pressed")).toBe("true");
    expect(root.getAttribute("data-theme")).toBe("dark");
    first.unmount();

    openAppearance();
    expect(root.getAttribute("data-brand")).toBe("emerald");
    await waitFor(() => expect(root.getAttribute("data-theme")).toBe("dark"));
    fireEvent.click(screen.getByRole("button", { name: "Reset theme" }));
    expect(root.getAttribute("data-brand")).toBe(onceUIStyle.brand);
    expect(localStorage.getItem("data-brand")).toBe(onceUIStyle.brand);
    expect(localStorage.getItem("data-theme")).toBeNull();
  } finally {
    cleanup();
    for (const name of root.getAttributeNames()) {
      if (!original.has(name)) root.removeAttribute(name);
    }
    for (const [name, value] of original) root.setAttribute(name, value);
    for (const name of Object.keys(localStorage)) {
      if (name.startsWith("data-")) localStorage.removeItem(name);
    }
  }
});

it("opens settings, saves the default provider, and verifies Jira access", async () => {
  const api = fixtureApi();
  const { unmount } = renderApp(api);
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: "Workflows" }));
  fireEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
  expect(screen.getByRole("radio", { name: "Claude Code" }).getAttribute("aria-checked")).toBe(
    "true",
  );

  fireEvent.click(screen.getByRole("tab", { name: "Jira" }));
  fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
  await screen.findByText("Connected to Jira");

  fireEvent.click(screen.getByRole("button", { name: "Back to workflows" }));
  await openWorkflowWizard();
  expect(screen.getByRole("radio", { name: "Claude Code" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  unmount();

  renderApp(api);
  await openWorkflowWizard();
  expect(screen.getByRole("radio", { name: "Claude Code" }).getAttribute("aria-checked")).toBe(
    "true",
  );
});

it("guides new users through onboarding and returns focus to the launch button", async () => {
  renderApp(fixtureApi());
  const launcher = await screen.findByRole("button", { name: "Take a tour" });
  launcher.focus();
  fireEvent.click(launcher);
  const guide = within(screen.getByRole("dialog", { name: "App guide" }));
  expect(guide.getByText("Step 1 of 4")).toBeTruthy();
  expect(document.querySelector("[data-workflow-app]")?.hasAttribute("inert")).toBe(true);

  fireEvent.click(guide.getByRole("button", { name: "Next" }));
  fireEvent.click(guide.getByRole("button", { name: "Next" }));
  expect(guide.getByRole("heading", { name: "Go from Idea to Build" })).toBeTruthy();
  fireEvent.click(guide.getByRole("button", { name: "Back" }));
  expect(guide.getByRole("heading", { name: "Bring in Company Knowledge" })).toBeTruthy();
  fireEvent.click(guide.getByRole("button", { name: "Back" }));
  expect(document.activeElement).toBe(guide.getByRole("button", { name: "Next" }));

  fireEvent.keyDown(guide.getByRole("button", { name: "Next" }), { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(launcher));
  expect(screen.queryByRole("dialog", { name: "App guide" })).toBeNull();
});

it("uses the configured mascot in the canvas tour and returns to Mascot settings", async () => {
  const api = fixtureApi([saved]);
  renderApp(api);
  await screen.findByRole("button", { name: "Inspect Build" });
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("tab", { name: "Mascot" }));
  await chooseOption("Finish", "Matte");
  await chooseOption("Preview activity", "Sleeping");
  expect(screen.getByRole("img", { name: "Mascot preview" }).dataset.state).toBe("sleeping");
  expect(JSON.parse(localStorage.getItem("agent-desktop.mascot-design") ?? "{}")).toEqual({
    v: 1,
    surface: "matte",
  });

  fireEvent.click(screen.getByRole("button", { name: "Try the app guide" }));
  const dialog = screen.getByRole("dialog", { name: "App guide" });
  const guide = within(dialog);
  expect(dialog.querySelector('[data-surface="matte"][data-state="idle"]')).toBeTruthy();
  expect(guide.getByText("Step 1 of 6")).toBeTruthy();
  for (let step = 0; step < 5; step++) {
    fireEvent.click(guide.getByRole("button", { name: "Next" }));
  }
  fireEvent.click(guide.getByRole("button", { name: "Done" }));
  const launcher = screen.getByRole("button", { name: "Try the app guide" });
  expect(screen.getByRole("tab", { name: "Mascot", selected: true })).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(launcher));
  expect(api.create).not.toHaveBeenCalled();
});

it("previews mascot changes and restores the saved mascot for a running task", async () => {
  const task: WorkflowBuildTask = {
    id: "1",
    title: "Scaffold app",
    detail: "Create the entry point.",
    files: [],
    state: "running",
    attempt: 1,
    revisions: [],
  };
  const api = fixtureApi([
    { ...saved, build: { state: "running", approvedAt: saved.createdAt, tasks: [task] } },
  ]);
  const { unmount } = renderApp(api);
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("tab", { name: "Mascot" }));
  await chooseOption("Finish", "Matte");
  await chooseOption("Movement", "Calm");
  const preview = screen.getByRole("img", { name: "Mascot preview" });
  expect(preview.dataset.surface).toBe("matte");
  expect(preview.dataset.personality).toBe("calm");
  unmount();

  renderApp(api);
  await screen.findByRole("button", { name: "Inspect Build" });
  fireEvent.click(screen.getByRole("button", { name: "Inspect Build" }));
  const status = screen
    .getByText("The provider is implementing this task.")
    .closest('[role="status"]');
  expect(status?.querySelector('[data-state="thinking"]')?.getAttribute("data-surface")).toBe(
    "matte",
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("tab", { name: "Mascot" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset mascot" }));
  expect(screen.getByRole("img", { name: "Mascot preview" }).dataset.surface).toBe("glossy");
});

it("preserves Jira headings, lists, formatting, and safe links in the issue preview", async () => {
  const api = fixtureApi();
  const item = {
    ...issue,
    descriptionDocument: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Acceptance criteria" }],
        },
        {
          type: "orderedList",
          attrs: { order: 3 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Verify settlement", marks: [{ type: "strong" }] },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Related issue",
              marks: [{ type: "link", attrs: { href: "/browse/FIN-1" } }],
            },
            {
              type: "text",
              text: "Blocked link",
              marks: [{ type: "link", attrs: { href: "file:///unsafe" } }],
            },
          ],
        },
      ],
    },
  };
  vi.mocked(api.issue).mockResolvedValue(jiraResponse(item));
  renderApp(api);
  await openWorkflowWizard();
  await chooseOption("Issue", /FIN-5546/);
  const preview = await screen.findByRole("region", { name: `Jira issue ${issue.key}` });
  const details = within(preview);
  expect(details.getByRole("heading", { name: "Acceptance criteria" })).toBeTruthy();
  expect(details.getByRole("list").getAttribute("start")).toBe("3");
  expect(details.getByText("Verify settlement").tagName).toBe("STRONG");
  expect(details.queryByRole("link", { name: "Blocked link" })).toBeNull();
  fireEvent.click(details.getByRole("link", { name: "Related issue" }));
  expect(api.openJiraLink).toHaveBeenCalledWith("https://example.atlassian.net/browse/FIN-1");
});

it("opens linked Jira details on demand and can follow links within the dialog", async () => {
  const api = fixtureApi();
  vi.mocked(api.issue).mockResolvedValue(
    jiraResponse({
      ...issue,
      linkedIssues: [{ key: "FIN-2", title: "Update ledger", relationship: "is blocked by" }],
    }),
  );
  vi.mocked(api.linkedIssue)
    .mockResolvedValueOnce(
      jiraResponse({
        ...issue,
        key: "FIN-2",
        title: "Update ledger",
        url: "https://example.atlassian.net/browse/FIN-2",
        description: "Change ledger permissions.",
        linkedIssues: [{ key: "FIN-3", relationship: "relates to" }],
      }),
    )
    .mockResolvedValueOnce(
      jiraResponse({
        ...issue,
        key: "FIN-3",
        title: "Audit permissions",
        url: "https://example.atlassian.net/browse/FIN-3",
        description: "Audit payment access.",
        linkedIssues: [],
      }),
    );
  renderApp(api);
  await openWorkflowWizard();
  await chooseOption("Issue", /FIN-5546/);
  const link = await screen.findByRole("button", { name: "FIN-2 · Update ledger" });
  expect(screen.getByText("is blocked by")).toBeTruthy();
  expect(api.linkedIssue).not.toHaveBeenCalled();
  fireEvent.click(link);
  const dialog = await screen.findByRole("dialog", { name: "Linked issue FIN-2" });
  await within(dialog).findByText("Change ledger permissions.");
  fireEvent.click(within(dialog).getByRole("button", { name: "FIN-3" }));
  const next = await screen.findByRole("dialog", { name: "Linked issue FIN-3" });
  await within(next).findByText("Audit payment access.");
  expect(within(next).getByRole("button", { name: "Back to FIN-2" })).toBeTruthy();
  expect(api.linkedIssue).toHaveBeenNthCalledWith(1, "FIN-2", false);
  expect(api.linkedIssue).toHaveBeenNthCalledWith(2, "FIN-3", false);
  fireEvent.keyDown(next, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Linked issue FIN-3" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "Start from Jira" })).toBeTruthy();
});

it("explains a blocker and enables planning after Jira reports it done", async () => {
  const api = fixtureApi();
  const blocker = {
    key: "FIN-2",
    title: "Update ledger",
    relationship: "is blocked by",
    isBlocker: true,
    status: "In progress",
    statusCategory: "indeterminate",
  };
  vi.mocked(api.issue)
    .mockResolvedValueOnce(jiraResponse({ ...issue, linkedIssues: [blocker] }))
    .mockResolvedValueOnce(
      jiraResponse({
        ...issue,
        linkedIssues: [{ ...blocker, status: "Shipped", statusCategory: "done" }],
      }),
    );
  renderApp(api);
  await openWorkflowWizard();
  await chooseOption("Issue", /FIN-5546/);
  const alert = await screen.findByRole("alert");
  expect(within(alert).getByText("Planning is blocked")).toBeTruthy();
  expect(within(alert).getByText(/FIN-2 · Update ledger · In progress/)).toBeTruthy();
  const start = screen.getByRole<HTMLButtonElement>("button", { name: "Start Plan" });
  const custom = screen.getByRole<HTMLButtonElement>("button", { name: "Start Plan Custom" });
  expect(start.disabled).toBe(true);
  expect(custom.disabled).toBe(true);
  fireEvent.click(start);
  fireEvent.click(custom);
  expect(api.create).not.toHaveBeenCalled();
  expect(api.planningOptions).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Check Jira again" }));
  await screen.findByText(/is blocked by · Shipped/);
  expect(start.disabled).toBe(false);
  expect(custom.disabled).toBe(false);
  fireEvent.click(custom);
  expect(api.create).toHaveBeenCalledExactlyOnceWith({
    issueKey: issue.key,
    provider: "codex",
    workspacePath: saved.workspacePath,
    customPlan: { skillIds: [] },
  });
  expect(api.planningOptions).not.toHaveBeenCalled();
  await within(screen.getByRole("complementary", { name: "Saved workflows" })).findByText(
    saved.request,
  );
});

it("replaces the view actions when opening a knowledge note for editing", async () => {
  const api = fixtureApi();
  vi.mocked(api.knowledge.list).mockResolvedValue([
    {
      id: "note-1",
      area: "Finance",
      title: "Ledger rules",
      bodyHtml: "<p>Settlement rules</p>",
      bodyText: "Settlement rules",
      paths: ["src/finance.ts"],
    },
  ]);
  renderApp(api);
  fireEvent.click(screen.getByRole("button", { name: "Company Knowledge" }));
  fireEvent.click(await screen.findByRole("button", { name: /^Ledger rules/ }));
  const dialog = await screen.findByRole("dialog", { name: "Ledger rules" });
  const edit = within(dialog).getByRole("button", { name: "Edit note" });

  fireEvent.click(edit);

  expect(screen.getByRole("dialog", { name: "Edit knowledge note" })).toBe(dialog);
  expect(edit.isConnected).toBe(false);
  expect(within(dialog).getByRole("button", { name: "Save note" })).toBeTruthy();
  expect(api.knowledge.save).not.toHaveBeenCalled();
});

it("filters the knowledge table across collapsed areas and can add a note to an area", async () => {
  const api = fixtureApi();
  vi.mocked(api.knowledge.list).mockResolvedValue([
    {
      id: "note-1",
      area: "Finance",
      title: "Ledger rules",
      bodyHtml: "<p>Settlement rules</p>",
      bodyText: "Settlement rules",
      paths: ["src/finance.ts"],
    },
    {
      id: "note-2",
      area: "Support",
      title: "Escalate a ticket",
      bodyHtml: "<p>Handoff procedure</p>",
      bodyText: "Handoff procedure",
      paths: [],
    },
  ]);
  renderApp(api);
  fireEvent.click(screen.getByRole("button", { name: "Company Knowledge" }));
  const table = within(screen.getByRole("table", { name: "Company Knowledge notes" }));
  const finance = await table.findByRole("button", { name: "Finance", expanded: true });
  fireEvent.click(finance);
  expect(table.queryByRole("button", { name: "Ledger rules" })).toBeNull();

  const search = screen.getByRole("searchbox", { name: "Search notes" });
  fireEvent.change(search, { target: { value: " FINANCE.ts " } });
  expect(table.getByRole("button", { name: "Ledger rules" })).toBeTruthy();
  expect(table.queryByRole("button", { name: "Escalate a ticket" })).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("1 of 2 notes · 1 area");

  fireEvent.change(search, { target: { value: "retention" } });
  expect(table.getByRole("heading", { name: "No matching notes" })).toBeTruthy();
  fireEvent.click(table.getByRole("button", { name: "Clear search" }));
  expect(table.getByRole("button", { name: "Finance", expanded: false })).toBeTruthy();
  expect(table.getByRole("button", { name: "Escalate a ticket" })).toBeTruthy();

  fireEvent.click(table.getByRole("button", { name: "Add note in Finance" }));
  const dialog = await screen.findByRole("dialog", { name: "New knowledge note" });
  expect(within(dialog).getByRole<HTMLInputElement>("textbox", { name: "Area" }).value).toBe(
    "Finance",
  );
});

it("deletes a knowledge note from its row only after confirmation", async () => {
  const api = fixtureApi();
  vi.mocked(api.knowledge.list).mockResolvedValue([
    {
      id: "note-1",
      area: "Finance",
      title: "Ledger rules",
      bodyHtml: "<p>Settlement rules</p>",
      bodyText: "Settlement rules",
      paths: [],
    },
  ]);
  vi.mocked(api.knowledge.remove).mockResolvedValue(undefined);
  renderApp(api);
  fireEvent.click(screen.getByRole("button", { name: "Company Knowledge" }));
  const remove = await screen.findByRole("button", { name: "Delete note: Ledger rules" });
  fireEvent.click(remove);
  const dialog = await screen.findByRole("dialog", { name: "Delete knowledge note?" });
  expect(screen.queryByRole("dialog", { name: "Ledger rules" })).toBeNull();
  expect(api.knowledge.remove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(api.knowledge.remove).not.toHaveBeenCalled();

  fireEvent.click(remove);
  const reopened = await screen.findByRole("dialog", { name: "Delete knowledge note?" });
  fireEvent.click(within(reopened).getByRole("button", { name: "Permanently delete" }));
  expect(api.knowledge.remove).toHaveBeenCalledExactlyOnceWith("note-1");
  await screen.findByRole("heading", { name: "No notes yet" });
  expect(remove.isConnected).toBe(false);
});
