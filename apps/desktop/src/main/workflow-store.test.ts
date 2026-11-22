import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readKnowledgeNote } from "./knowledge";
import { openWorkflowStore } from "./workflow-store";

it("persists ordered workflow records across database reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "jari-workflow-store-"));
  const file = join(directory, "workflows.sqlite");
  try {
    const store = openWorkflowStore(file);
    const input = {
      request: "Trabajemos en FIN-5546.",
      provider: "claude",
      workspacePath: directory,
    } as const;
    const first = store.create(input);
    const second = store.create({
      ...input,
      request: "Document workflow setup",
      provider: "codex",
    });
    const source = {
      key: "FIN-5546",
      title: "Payment state",
      status: "Open",
      description: "Show the current settlement state.",
      descriptionDocument: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Show the current settlement state." }],
          },
        ],
      },
      url: "https://example.atlassian.net/browse/FIN-5546",
      comments: [],
      references: [],
    };
    const note = store.saveKnowledge(
      null,
      readKnowledgeNote({
        area: "Finance",
        title: "Ledger rules",
        bodyHtml: "<p>Close <strong>prior periods</strong>.</p><script>unsafe()</script>",
        paths: [" src/ledger.ts ", "", "src/ledger.ts", "src/rules.ts"],
      }),
    );
    expect(note.bodyHtml).toBe("<p>Close <strong>prior periods</strong>.</p>");
    const knowledge = [
      { area: note.area, title: note.title, bodyText: note.bodyText, paths: note.paths },
    ];
    const jira = store.create({
      ...input,
      request: source.title,
      source,
      knowledge,
      plan: { state: "running" },
    });
    const plan = { state: "ready", text: "Review the existing payment view." } as const;
    store.updatePlan(jira.id, plan);
    store.close();

    const reopened = openWorkflowStore(file);
    try {
      expect(reopened.list()).toEqual([{ ...jira, plan }, second, first]);
      expect(reopened.listKnowledge()).toEqual([note]);
      const updated = reopened.saveKnowledge(note.id, {
        ...note,
        area: "finance",
        paths: ["src/new.ts"],
      });
      expect(updated.area).toBe("Finance");
      expect(reopened.listKnowledge()).toEqual([updated]);
      reopened.removeKnowledge(note.id);
      expect(reopened.listKnowledge()).toEqual([]);
      expect(reopened.list().at(0)?.knowledge).toEqual([
        {
          area: "Finance",
          title: "Ledger rules",
          bodyText: "Close prior periods.",
          paths: ["src/ledger.ts", "src/rules.ts"],
        },
      ]);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
