import { isWorkflowProvider, workflowProviders } from "@agent-desktop/shared";
import type {
  DesktopInfo,
  KnowledgeNote,
  WorkflowApi,
  WorkflowProvider,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Icon } from "@once-ui-system/core/components/Icon";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import { Activity, useEffect, useRef, useState } from "react";
import icon from "../../../resources/icon.png?url";
import { KnowledgePage } from "./knowledge-page";
import { SettingsPage } from "./settings-page";
import type { Selection } from "./workflow/stages";
import { WorkflowDetails } from "./workflow/workflow-details";
import { WorkflowForm, workflowError } from "./workflow/workflow-form";
import { WorkflowGraph } from "./workflow/workflow-graph";

const defaultProviderKey = "agent-desktop.default-provider";

function readDefaultProvider(): WorkflowProvider {
  try {
    const saved = localStorage.getItem(defaultProviderKey);
    if (isWorkflowProvider(saved)) return saved;
  } catch {
    // The app can still start when the local profile storage is unavailable.
  }
  return "codex";
}

export function App({ desktop, api }: { desktop: DesktopInfo; api: WorkflowApi }) {
  const [page, setPage] = useState<"workflows" | "settings" | "knowledge">("workflows");
  const settingsButton = useRef<HTMLButtonElement>(null);
  const knowledgeButton = useRef<HTMLButtonElement>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeNote[]>();
  const [knowledgeError, setKnowledgeError] = useState("");
  const [knowledgeAttempt, setKnowledgeAttempt] = useState(0);
  const [defaultProvider, setDefaultProvider] = useState(readDefaultProvider);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = workflows.find(({ id }) => id === currentId) ?? null;
  const planning = workflows.some(({ plan }) => plan?.state === "running");
  const [selection, setSelection] = useState<Selection>({ stage: "idea" });
  const [canvasSession, setCanvasSession] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void api.knowledge.list().then(
      (notes) => {
        if (active) setKnowledge(notes);
      },
      (failure: unknown) => {
        if (active)
          setKnowledgeError(workflowError(failure, "Company Knowledge could not be loaded."));
      },
    );
    return () => {
      active = false;
    };
  }, [api, knowledgeAttempt]);

  useEffect(() => {
    let active = true;
    void api.list().then(
      (records) => {
        if (active) {
          setWorkflows(records);
          setCurrentId(records[0]?.id ?? null);
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

  useEffect(() => {
    if (!planning) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const records = await api.list();
        if (active) setWorkflows(records);
      } catch {
        // The next refresh can recover a transient IPC failure.
      }
      if (active) timer = setTimeout(() => void poll(), 1000);
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, planning]);

  function newWorkflow() {
    if (current) {
      setCurrentId(null);
      setSelection({ stage: "idea" });
      setCanvasSession((session) => session + 1);
    } else {
      document.getElementById("jira-scope")?.focus();
    }
  }

  function updateWorkflow(record: WorkflowRecord) {
    setWorkflows((records) => records.map((item) => (item.id === record.id ? record : item)));
  }

  const workspaceName = current?.workspacePath.split(/[/\\]/).filter(Boolean).at(-1);
  const hasWorkflow = current !== null;

  return (
    <>
      <Activity mode={page === "workflows" ? "visible" : "hidden"}>
        <main className="workflow-app" data-workflow-app>
          <header className="app-header">
            <div className="app-brand">
              <img src={icon} width="32" height="32" alt="" />
              <h1>{desktop.name}</h1>
            </div>
            <Row gap="16" vertical="center">
              <Text textVariant="body-default-s" onBackground="neutral-weak" data-desktop-version>
                Version {desktop.version}
              </Text>
              <Button
                ref={knowledgeButton}
                type="button"
                size="s"
                variant="tertiary"
                prefixIcon="book"
                onClick={() => setPage("knowledge")}
              >
                Company Knowledge
              </Button>
              <Button
                ref={settingsButton}
                type="button"
                size="s"
                variant="tertiary"
                prefixIcon="settings"
                onClick={() => setPage("settings")}
              >
                Settings
              </Button>
            </Row>
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
                      onClick={() => setCurrentId(workflow.id)}
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
                    <span title={current.workspacePath}>
                      {workspaceName ?? current.workspacePath}
                    </span>
                  </div>
                )}
              </div>
              {current && <span className="draft-label">Saved locally</span>}
            </header>
            <WorkflowGraph
              key={canvasSession}
              hasWorkflow={hasWorkflow}
              plan={current?.plan}
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
              <WorkflowDetails
                key={current.id}
                workflow={current}
                selection={selection}
                openJiraLink={api.openJiraLink}
                retryPlan={async () => {
                  updateWorkflow(await api.retryPlan(current.id));
                }}
                answerPlan={async (answer) => {
                  updateWorkflow(await api.answerPlan(current.id, answer));
                }}
              />
            ) : (
              <WorkflowForm
                api={api}
                defaultProvider={defaultProvider}
                knowledge={knowledge}
                onOpenKnowledge={() => setPage("knowledge")}
                onCreated={(workflow) => {
                  setWorkflows((records) => [workflow, ...records]);
                  setCurrentId(workflow.id);
                  setSelection({ stage: "plan" });
                  setCanvasSession((session) => session + 1);
                }}
              />
            )}
          </aside>
        </main>
      </Activity>
      {page === "settings" && (
        <SettingsPage
          desktop={desktop}
          checkJira={() => api.assignedSprintIssues()}
          defaultProvider={defaultProvider}
          onProviderChange={(provider) => {
            localStorage.setItem(defaultProviderKey, provider);
            setDefaultProvider(provider);
          }}
          onBack={() => {
            setPage("workflows");
            requestAnimationFrame(() => settingsButton.current?.focus());
          }}
        />
      )}
      {page === "knowledge" && (
        <KnowledgePage
          appName={desktop.name}
          notes={knowledge}
          error={knowledgeError}
          onReload={() => {
            setKnowledgeError("");
            setKnowledgeAttempt((attempt) => attempt + 1);
          }}
          onSave={async (id, input) => {
            const note = await api.knowledge.save(id, input);
            setKnowledge((notes = []) =>
              [...notes.filter((item) => item.id !== note.id), note].sort(
                (a, b) => a.area.localeCompare(b.area) || a.title.localeCompare(b.title),
              ),
            );
          }}
          onRemove={async (id) => {
            await api.knowledge.remove(id);
            setKnowledge((notes) => notes?.filter((note) => note.id !== id));
          }}
          onBack={() => {
            setPage("workflows");
            requestAnimationFrame(() => knowledgeButton.current?.focus());
          }}
        />
      )}
    </>
  );
}
