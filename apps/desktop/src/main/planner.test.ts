import { expect, it, vi } from "vitest";
import { runPlanning } from "./planner";
import { claude } from "./providers/claude";

vi.mock("./providers/claude", () => ({ claude: { plan: vi.fn() } }));

it("passes the Jira issue, attached knowledge, and clarification replies to planning", async () => {
  vi.mocked(claude.plan).mockResolvedValue({ state: "ready", text: "Review ledger changes." });
  const result = await runPlanning(
    "claude",
    {
      key: "FIN-1",
      url: "https://example.atlassian.net/browse/FIN-1",
      title: "Show settlements",
      description: "Add the settlement status.",
      status: "Open",
      comments: [],
      references: [],
    },
    "/workspace",
    new AbortController().signal,
    [
      {
        area: "Finance",
        title: "Settlement rules",
        bodyText: "Settlements close at the end of the accounting period.",
        paths: ["src/finance/ledger.ts"],
      },
    ],
    [
      { questions: "Which ledger should this support?", answer: "The primary ledger." },
      { questions: "Should closed periods appear?", answer: "Show only open periods." },
    ],
  );
  expect(result).toEqual({ state: "ready", text: "Review ledger changes." });
  const request = vi.mocked(claude.plan).mock.calls[0]?.[0];
  expect(request?.cwd).toBe("/workspace");
  expect(request?.prompt).toContain("Add the settlement status.");
  expect(request?.prompt).toContain("Settlements close at the end of the accounting period.");
  expect(request?.prompt).toContain("src/finance/ledger.ts");
  expect(request?.prompt).toContain("The primary ledger.");
  expect(request?.prompt).toContain("Should closed periods appear?");
  expect(request?.prompt).toContain("Show only open periods.");
});
