import type { WorkflowApi, WorkflowRecord } from "@agent-desktop/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./app";

const desktop = { name: "Agent Desktop", version: "0.1.0" };
const saved: WorkflowRecord = {
  id: "workflow-1",
  createdAt: "2026-11-21T12:00:00Z",
  request: "Trabajemos en FIN-5546.",
  workspacePath: "/workspaces/finance",
  provider: "claude",
};

beforeEach(() => {
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
});

it("requires a workspace, saves a request, and shows the selected workflow", async () => {
  const api: WorkflowApi = {
    list: vi.fn().mockResolvedValue([]),
    chooseWorkspace: vi.fn().mockResolvedValue(saved.workspacePath),
    create: vi.fn().mockResolvedValue(saved),
  };
  render(<App desktop={desktop} api={api} />);

  const create = await screen.findByRole<HTMLButtonElement>("button", { name: "Create workflow" });
  expect(create.disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Request" }), {
    target: { value: saved.request },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
  expect(create.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
  await screen.findByText(saved.workspacePath);
  expect(create.disabled).toBe(false);
  fireEvent.click(create);

  const details = within(screen.getByRole("complementary", { name: "Workflow details" }));
  await details.findByText(saved.request);
  expect(api.create).toHaveBeenCalledWith({
    request: saved.request,
    provider: saved.provider,
    workspacePath: saved.workspacePath,
  });
  expect(details.getByText("Request saved")).toBeTruthy();
});

it("reopens saved history and keeps Build blocked while the plan is unavailable", async () => {
  const api: WorkflowApi = {
    list: vi.fn().mockResolvedValue([saved]),
    chooseWorkspace: vi.fn(),
    create: vi.fn(),
  };
  render(<App desktop={desktop} api={api} />);

  const history = within(screen.getByRole("complementary", { name: "Saved workflows" }));
  const previous = await history.findByRole("button", { name: /Trabajemos en FIN-5546/ });
  fireEvent.click(history.getByRole("button", { name: "New workflow" }));
  await screen.findByRole("heading", { name: "New workflow" });
  fireEvent.click(previous);
  fireEvent.click(screen.getByRole("button", { name: "Inspect Build" }));

  const details = within(screen.getByRole("complementary", { name: "Workflow details" }));
  expect(details.getByRole("heading", { name: "Build" })).toBeTruthy();
  expect(details.getByText("Blocked")).toBeTruthy();
  expect(
    details.getByText("Build requires an approved plan. No execution has started."),
  ).toBeTruthy();
});
