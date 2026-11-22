import type { WorkItem, WorkflowApi, WorkflowRecord } from "@agent-desktop/shared";
import { LayoutProvider, ToastProvider } from "@once-ui-system/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./app";

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

function fixtureApi(records: WorkflowRecord[] = []): WorkflowApi {
  return {
    knowledge: {
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      remove: vi.fn(),
    },
    list: vi.fn().mockResolvedValue(records),
    chooseWorkspace: vi.fn().mockResolvedValue(saved.workspacePath),
    assignedSprintIssues: vi.fn().mockResolvedValue([issue]),
    boards: vi.fn().mockResolvedValue([{ id: 1, name: "Finance" }]),
    activeSprints: vi.fn().mockResolvedValue([{ id: 2, name: "Current sprint" }]),
    sprintIssues: vi.fn().mockResolvedValue([issue]),
    issue: vi.fn().mockResolvedValue(issue),
    openJiraLink: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(saved),
    retryPlan: vi.fn().mockResolvedValue(saved),
    answerPlan: vi.fn().mockResolvedValue(saved),
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.removeItem("agent-desktop.default-provider");
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
  const start = await screen.findByRole<HTMLButtonElement>("button", { name: "Start plan" });
  expect(start.disabled).toBe(true);
  await screen.findByRole("option", { name: /FIN-5546/ });
  expect(api.assignedSprintIssues).toHaveBeenCalledOnce();
  expect(api.boards).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Issue", { exact: true }), {
    target: { value: issue.key },
  });
  await screen.findByText(issue.description);

  fireEvent.change(screen.getByLabelText("Show issues"), { target: { value: "board" } });
  expect(screen.queryByText(issue.description)).toBeNull();
  await screen.findByRole("option", { name: "Finance" });
  fireEvent.change(screen.getByLabelText("Jira board"), { target: { value: "1" } });
  await screen.findByRole("option", { name: "Current sprint" });
  fireEvent.change(screen.getByLabelText("Active sprint"), { target: { value: "2" } });
  await screen.findByRole("option", { name: /FIN-5546/ });
  fireEvent.change(screen.getByLabelText("Issue", { exact: true }), {
    target: { value: issue.key },
  });
  await screen.findByText(issue.description);
  expect(start.disabled).toBe(true);
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
  fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
  await screen.findByText(saved.workspacePath);
  fireEvent.click(start);

  const details = within(screen.getByRole("complementary", { name: "Workflow details" }));
  await details.findByText("Claude Code is preparing a plan.");
  expect(api.create).toHaveBeenCalledWith({
    issueKey: issue.key,
    provider: saved.provider,
    workspacePath: saved.workspacePath,
    knowledgeNoteIds: ["note-1"],
  });
});

it("reopens saved history and keeps Build blocked while the plan is unavailable", async () => {
  const api = fixtureApi([
    { ...saved, plan: { state: "ready", text: "Review the payment display." } },
  ]);
  renderApp(api);

  const history = within(screen.getByRole("complementary", { name: "Saved workflows" }));
  const previous = await history.findByRole("button", { name: /FIN-5546/ });
  fireEvent.click(history.getByRole("button", { name: "New workflow" }));
  await screen.findByRole("heading", { name: "Start from Jira" });
  fireEvent.click(previous);
  fireEvent.click(screen.getByRole("button", { name: "Inspect Build" }));

  const details = within(screen.getByRole("complementary", { name: "Workflow details" }));
  expect(details.getByRole("heading", { name: "Build" })).toBeTruthy();
  expect(details.getByText("Blocked")).toBeTruthy();
  expect(
    details.getByText("Build requires an approved plan. No execution has started."),
  ).toBeTruthy();
});

it("accepts a planning reply and keeps it available if sending fails", async () => {
  const questions = "Should the plan include closed periods?";
  const api = fixtureApi([{ ...saved, plan: { state: "needs-input", text: questions } }]);
  vi.mocked(api.answerPlan)
    .mockRejectedValueOnce(new Error("The workspace is unavailable."))
    .mockResolvedValueOnce(saved);
  renderApp(api);
  await screen.findByRole("button", { name: /FIN-5546/ });
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

it("opens settings, saves the default provider, and verifies Jira access", async () => {
  const api = fixtureApi();
  const { unmount } = renderApp(api);
  await screen.findByRole("option", { name: /FIN-5546/ });
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
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "Claude Code" }).checked).toBe(true);
  unmount();

  renderApp(api);
  await screen.findByRole("option", { name: /FIN-5546/ });
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "Claude Code" }).checked).toBe(true);
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
  vi.mocked(api.issue).mockResolvedValue(item);
  renderApp(api);
  await screen.findByRole("option", { name: /FIN-5546/ });
  fireEvent.change(screen.getByLabelText("Issue", { exact: true }), {
    target: { value: issue.key },
  });
  const preview = await screen.findByRole("region", { name: `Jira issue ${issue.key}` });
  const details = within(preview);
  expect(details.getByRole("heading", { name: "Acceptance criteria" })).toBeTruthy();
  expect(details.getByRole("list").getAttribute("start")).toBe("3");
  expect(details.getByText("Verify settlement").tagName).toBe("STRONG");
  expect(details.queryByRole("link", { name: "Blocked link" })).toBeNull();
  fireEvent.click(details.getByRole("link", { name: "Related issue" }));
  expect(api.openJiraLink).toHaveBeenCalledWith("https://example.atlassian.net/browse/FIN-1");
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
  fireEvent.click(await screen.findByRole("button", { name: /Ledger rules/ }));
  const dialog = await screen.findByRole("dialog", { name: "Ledger rules" });
  const edit = within(dialog).getByRole("button", { name: "Edit note" });

  fireEvent.click(edit);

  expect(screen.getByRole("dialog", { name: "Edit knowledge note" })).toBe(dialog);
  expect(edit.isConnected).toBe(false);
  expect(within(dialog).getByRole("button", { name: "Save note" })).toBeTruthy();
  expect(api.knowledge.save).not.toHaveBeenCalled();
});
