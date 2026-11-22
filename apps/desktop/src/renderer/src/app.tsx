import { workflowProviders } from "@agent-desktop/shared";
import type { DesktopInfo, WorkflowApi, WorkflowRecord } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Icon } from "@once-ui-system/core/components/Icon";
import { useEffect, useState } from "react";
import icon from "../../../resources/icon.png?url";
import type { Selection } from "./workflow/stages";
import { WorkflowDetails } from "./workflow/workflow-details";
import { WorkflowForm, workflowError } from "./workflow/workflow-form";
import { WorkflowGraph } from "./workflow/workflow-graph";

export function App({ desktop, api }: { desktop: DesktopInfo; api: WorkflowApi }) {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [current, setCurrent] = useState<WorkflowRecord | null>(null);
  const [selection, setSelection] = useState<Selection>({ stage: "idea" });
  const [canvasSession, setCanvasSession] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void api.list().then(
      (records) => {
        if (active) {
          setWorkflows(records);
          setCurrent(records[0] ?? null);
          setLoading(false);
        }
      },
      (failure: unknown) => {
        if (active) {
          setLoadError(workflowError(failure, "Saved workflows could not be loaded."));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, loadAttempt]);

  function newWorkflow() {
    if (current) {
      setCurrent(null);
      setSelection({ stage: "idea" });
      setCanvasSession((session) => session + 1);
    } else {
      document.getElementById("workflow-request")?.focus();
    }
  }

  const workspaceName = current?.workspacePath.split(/[/\\]/).filter(Boolean).at(-1);
  const hasWorkflow = current !== null;

  return (
    <main className="workflow-app" data-workflow-app>
      <header className="app-header">
        <div className="app-brand">
          <img src={icon} width="32" height="32" alt="" />
          <h1>{desktop.name}</h1>
        </div>
        <span className="app-version" data-desktop-version>
          Version {desktop.version}
        </span>
      </header>

      <aside className="workflow-sidebar" aria-label="Saved workflows">
        <Button
          variant="secondary"
          type="button"
          prefixIcon="plus"
          onClick={newWorkflow}
          disabled={loading || Boolean(loadError)}
        >
          New workflow
        </Button>
        <h2>Workflows</h2>
        {loading ? (
          <p role="status">Loading workflows…</p>
        ) : workflows.length === 0 ? (
          <p>{loadError ? "History unavailable" : "No saved workflows"}</p>
        ) : (
          <ul className="workflow-history">
            {workflows.map((workflow) => (
              <li key={workflow.id}>
                <button
                  type="button"
                  className="history-item"
                  aria-pressed={current?.id === workflow.id}
                  onClick={() => setCurrent(workflow)}
                >
                  <Icon name="document" size="s" decorative />
                  <span>
                    <strong title={workflow.request}>{workflow.request}</strong>
                    <small>{workflowProviders[workflow.provider]}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="workflow-workspace">
        <header className="workspace-header">
          <div>
            <h2 title={current?.request}>{current?.request ?? "Workflow canvas"}</h2>
            {current && (
              <div className="workspace-meta">
                <span>{workflowProviders[current.provider]}</span>
                <span title={current.workspacePath}>{workspaceName ?? current.workspacePath}</span>
              </div>
            )}
          </div>
          {current && <span className="draft-label">Saved locally</span>}
        </header>
        <WorkflowGraph
          key={canvasSession}
          hasWorkflow={hasWorkflow}
          selection={selection}
          onSelect={setSelection}
        />
      </div>

      <aside className="workflow-inspector" aria-label="Workflow details">
        {loading ? (
          <p role="status">Opening workflow history…</p>
        ) : loadError ? (
          <>
            <h2>Workflow history</h2>
            <p className="form-error" role="alert">
              {loadError}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoadError("");
                setLoading(true);
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              Retry
            </Button>
          </>
        ) : current ? (
          <WorkflowDetails workflow={current} selection={selection} />
        ) : (
          <WorkflowForm
            api={api}
            onCreated={(workflow) => {
              setWorkflows((records) => [workflow, ...records]);
              setCurrent(workflow);
              setSelection({ stage: "idea" });
              setCanvasSession((session) => session + 1);
            }}
          />
        )}
      </aside>
    </main>
  );
}
