import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
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
    store.close();

    const reopened = openWorkflowStore(file);
    try {
      expect(reopened.list()).toEqual([second, first]);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
