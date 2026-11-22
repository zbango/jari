import { workflowProviders, workflowRequestLimit } from "@agent-desktop/shared";
import type { WorkflowApi, WorkflowProvider, WorkflowRecord } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { useState } from "react";
import type { FormEvent } from "react";

export function workflowError(error: unknown, fallback: string): string {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
    : fallback;
}

export function WorkflowForm({
  api,
  onCreated,
}: {
  api: WorkflowApi;
  onCreated(workflow: WorkflowRecord): void;
}) {
  const [request, setRequest] = useState("");
  const [provider, setProvider] = useState<WorkflowProvider>("codex");
  const [workspacePath, setWorkspacePath] = useState("");
  const [pending, setPending] = useState<"picker" | "save" | null>(null);
  const [error, setError] = useState("");

  async function chooseWorkspace() {
    setError("");
    setPending("picker");
    try {
      const path = await api.chooseWorkspace();
      if (path) {
        setWorkspacePath(path);
      }
    } catch (failure) {
      setError(workflowError(failure, "The folder picker could not open."));
    } finally {
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !request.trim() || !workspacePath) {
      return;
    }
    setError("");
    setPending("save");
    try {
      onCreated(await api.create({ request, provider, workspacePath }));
    } catch (failure) {
      setError(workflowError(failure, "The workflow could not be saved."));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <h2>New workflow</h2>
      <p className="inspector-description">Describe what you want to work on.</p>
      <form className="workflow-form" onSubmit={submit}>
        <label htmlFor="workflow-request">Request</label>
        <textarea
          id="workflow-request"
          placeholder="Trabajemos en FIN-5546."
          rows={5}
          required
          maxLength={workflowRequestLimit}
          value={request}
          onChange={(event) => setRequest(event.currentTarget.value)}
        />

        <fieldset>
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
          disabled={pending !== null || !request.trim() || !workspacePath}
          className="workflow-primary"
        >
          {pending === "save" ? "Saving…" : "Create workflow"}
        </Button>
      </form>
    </>
  );
}
