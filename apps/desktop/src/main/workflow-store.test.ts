import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { readKnowledgeNote } from "./knowledge";
import { openWorkflowStore } from "./workflow-store";

it("persists ordered workflow records across database reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "jari-workflow-store-"));
  const file = join(directory, "workflows.sqlite");
  try {
    const store = openWorkflowStore(file);
    expect(store.lastWorkspace()).toBeNull();
    store.saveWorkspace(directory);
    const lastWorkspace = join(directory, "workspace-two");
    store.saveWorkspace(lastWorkspace);
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
    const custom = {
      model: "sonnet",
      effort: "high",
      skillIds: [join(directory, "skills", "review", "SKILL.md")],
    };
    const jira = store.create({
      ...input,
      request: source.title,
      source,
      knowledge,
      plan: { state: "running", custom },
    });
    const plan = { state: "ready", text: "Review the existing payment view.", custom } as const;
    store.updatePlan(jira.id, plan);
    const build = { state: "completed", approvedAt: jira.createdAt, summary: "Done." } as const;
    store.saveBuild(jira.id, build);
    store.close();

    const reopened = openWorkflowStore(file);
    try {
      expect(reopened.lastWorkspace()).toBe(lastWorkspace);
      expect(reopened.list()).toEqual([{ ...jira, plan, build }, second, first]);
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
      reopened.removeWorkflow(jira.id);
      expect(reopened.list()).toEqual([second, first]);
      const reader = new DatabaseSync(file, { readOnly: true });
      try {
        expect(
          reader
            .prepare(`
          SELECT
            (SELECT count(*) FROM workflow_intake WHERE id = ?1) AS intake,
            (SELECT count(*) FROM workflow_knowledge WHERE id = ?1) AS knowledge,
            (SELECT count(*) FROM workflow_build WHERE id = ?1) AS build
        `)
            .get(jira.id),
        ).toEqual({ intake: 0, knowledge: 0, build: 0 });
      } finally {
        reader.close();
      }
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
