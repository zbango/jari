import { isWorkflowProvider, workflowProviders, workflowSections } from "@agent-desktop/shared";
import type {
  DesktopInfo,
  KnowledgeNote,
  ReplayPlanInput,
  WorkflowApi,
  WorkflowProvider,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { parseMascotDesign, useToast } from "@once-ui-system/core";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Dialog } from "@once-ui-system/core/components/Dialog";
import { Feedback } from "@once-ui-system/core/components/Feedback";
import { Icon } from "@once-ui-system/core/components/Icon";
import { IconButton } from "@once-ui-system/core/components/IconButton";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import { Activity, useEffect, useLayoutEffect, useRef, useState } from "react";
import icon from "../../../resources/icon.png?url";
import { AppGuide } from "./app-guide";
import { KnowledgePage } from "./knowledge-page";
import { SettingsPage } from "./settings-page";
import { PlanReplay } from "./workflow/plan-replay";
import {
  defaultMascotDesign,
  MascotDesignContext,
  mascotStorageKey,
} from "./workflow/provider-activity";
import { ProviderMessages } from "./workflow/provider-messages";
import { ProviderQuota } from "./workflow/provider-quota";
import type { Selection } from "./workflow/stages";
import { canvasStyleStorageKey, readCanvasStyle } from "./workflow/workflow-canvas-style";
import { WorkflowDetails } from "./workflow/workflow-details";
import { workflowError } from "./workflow/workflow-error";
import { WorkflowForm } from "./workflow/workflow-form";
import { WorkflowGraph } from "./workflow/workflow-graph";
import { WorkflowMilestoneDetails } from "./workflow/workflow-milestones";
import { WorkflowOnboarding } from "./workflow/workflow-onboarding";
import { WorkflowPlanContent } from "./workflow/workflow-plan-content";

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

function readMascotDesign() {
  try {
    return parseMascotDesign(localStorage.getItem(mascotStorageKey));
  } catch {
    return defaultMascotDesign;
  }
}

function isWorkflowRunning({ plan, build, milestones }: WorkflowRecord) {
  return (
    plan?.state === "running" ||
    (plan?.state === "ready" && plan.reviewAttempt?.state === "running") ||
    build?.state === "running" ||
    (milestones?.some(({ state }) => state === "running") ?? false)
  );
}

export function App({ desktop, api }: { desktop: DesktopInfo; api: WorkflowApi }) {
  const { addToast } = useToast();
  const [page, setPage] = useState<"workflows" | "settings" | "knowledge">("workflows");
  const [guideOrigin, setGuideOrigin] = useState<"workflows" | "settings">();
  const [settingsTab, setSettingsTab] = useState<"appearance" | "mascot">("appearance");
  const guideButton = useRef<HTMLButtonElement>(null);
  const guideLauncher = useRef<HTMLElement | null>(null);
  const settingsGuideButton = useRef<HTMLButtonElement>(null);
  const newWorkflowButton = useRef<HTMLButtonElement>(null);
  const historyRevision = useRef(0);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const knowledgeButton = useRef<HTMLButtonElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const inspectedWorkflow = useRef<string | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeNote[]>();
  const [knowledgeError, setKnowledgeError] = useState("");
  const [knowledgeAttempt, setKnowledgeAttempt] = useState(0);
  const [defaultProvider, setDefaultProvider] = useState(readDefaultProvider);
  const [mascotDesign, setMascotDesign] = useState(readMascotDesign);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string>();
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const current = workflows.find(({ id }) => id === currentId) ?? null;
  const review = workflows.find(({ id }) => id === reviewId);
  const working = workflows.some(isWorkflowRunning);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowRecord>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [selection, setSelection] = useState<Selection>({ stage: "idea" });
  const selectedMilestone = current?.milestones?.find(({ id }) => id === selection.milestoneId);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [canvasSession, setCanvasSession] = useState(0);
  const [canvasStyle, setCanvasStyle] = useState(readCanvasStyle);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useLayoutEffect(() => {
    inspectedWorkflow.current = currentId;
    if (inspector.current) inspector.current.scrollTop = 0;
  }, [
    currentId,
    selection.stage,
    selection.section,
    selection.taskId,
    selection.milestoneId,
    selection.queue,
  ]);

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
    if (!working) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const revision = historyRevision.current;
      try {
        const records = await api.list();
        if (active && revision === historyRevision.current) setWorkflows(records);
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
  }, [api, working]);

  function updateWorkflow(record: WorkflowRecord) {
    historyRevision.current += 1;
    setWorkflows((records) => records.map((item) => (item.id === record.id ? record : item)));
  }

  async function retryPlan(id: string) {
    updateWorkflow(await api.retryPlan(id));
  }

  async function exportTranscript(id: string) {
    try {
      if (await api.exportTranscript(id)) {
        addToast({ tone: "success", message: "Provider transcript exported" });
      }
    } catch (error) {
      addToast({
        tone: "danger",
        message: workflowError(error, "The provider transcript could not be exported."),
      });
    }
  }

  async function openWorkspaceInCursor(id: string) {
    try {
      await api.openWorkspaceInCursor(id);
    } catch (error) {
      addToast({
        tone: "danger",
        message: workflowError(error, "The workspace could not be opened in Cursor."),
      });
    }
  }

  async function answerPlan(id: string, answer: string) {
    updateWorkflow(await api.answerPlan(id, answer));
  }

  function openPlanReview(id: string) {
    setApprovalError("");
    setReviewId(id);
  }

  function showNewWorkflow(workflow: WorkflowRecord) {
    historyRevision.current += 1;
    setWorkflows((records) => [workflow, ...records.filter(({ id }) => id !== workflow.id)]);
    setCurrentId(workflow.id);
    openPlanReview(workflow.id);
    setSelection({ stage: "plan" });
    setCanvasSession((session) => session + 1);
  }

  async function replayPlan(id: string, input: ReplayPlanInput) {
    showNewWorkflow(await api.replayPlan(id, input));
  }

  async function removeWorkflow() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    const id = deleteTarget.id;
    try {
      await api.removeWorkflow(id);
      historyRevision.current += 1;
      setWorkflows((records) => records.filter((record) => record.id !== id));
      if (currentId === id) {
        setCurrentId(workflows.find((record) => record.id !== id)?.id ?? null);
        setSelection({ stage: "idea" });
        setCanvasSession((session) => session + 1);
      }
      setDeleteTarget(undefined);
      requestAnimationFrame(() => newWorkflowButton.current?.focus());
      addToast({ tone: "success", message: "Workflow deleted" });
    } catch (error) {
      setDeleteError(workflowError(error, "The workflow could not be deleted."));
    } finally {
      setDeleting(false);
    }
  }

  async function continueToBuild(workflow: WorkflowRecord) {
    if (approving) return;
    setApproving(true);
    setApprovalError("");
    try {
      if (!workflow.build) updateWorkflow(await api.approvePlan(workflow.id));
      setCurrentId(workflow.id);
      setSelection({ stage: "build" });
      setCanvasSession((session) => session + 1);
      setReviewId(undefined);
    } catch (error) {
      setApprovalError(workflowError(error, "The plan could not be approved."));
    } finally {
      setApproving(false);
    }
  }

  function startGuide(origin: "workflows" | "settings") {
    guideLauncher.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPage("workflows");
    setGuideOrigin(origin);
  }

  function closeGuide() {
    setGuideOrigin(undefined);
    if (guideOrigin === "settings") {
      setSettingsTab("mascot");
      setPage("settings");
      requestAnimationFrame(() => settingsGuideButton.current?.focus());
      return;
    }
    requestAnimationFrame(() => {
      const launcher = guideLauncher.current;
      if (launcher?.isConnected && launcher !== document.body) launcher.focus();
      else guideButton.current?.focus();
    });
  }

  const workspaceName = current?.workspacePath.split(/[/\\]/).filter(Boolean).at(-1);

  return (
    <MascotDesignContext value={mascotDesign}>
      <Activity mode={page === "workflows" ? "visible" : "hidden"}>
        <main className="workflow-app" data-workflow-app inert={Boolean(guideOrigin)}>
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
                data-guide="knowledge"
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
                ref={guideButton}
                disabled={loading}
                type="button"
                size="s"
                variant="tertiary"
                prefixIcon="help"
                aria-haspopup="dialog"
                onClick={() => startGuide("workflows")}
              >
                App guide
              </Button>
              <Button
                data-guide="settings"
                ref={settingsButton}
                type="button"
                size="s"
                variant="tertiary"
                prefixIcon="settings"
                onClick={() => {
                  setSettingsTab("appearance");
                  setPage("settings");
                }}
              >
                Settings
              </Button>
            </Row>
          </header>

          <aside className="workflow-sidebar" aria-label="Saved workflows">
            {current && (
              <Button
                data-guide="new-workflow"
                ref={newWorkflowButton}
                variant="secondary"
                type="button"
                prefixIcon="plus"
                aria-haspopup="dialog"
                onClick={() => setIntakeOpen(true)}
              >
                New workflow
              </Button>
            )}
            <h2>Workflows</h2>
            {loading ? (
              <p role="status">Loading workflows…</p>
            ) : workflows.length === 0 ? (
              <p>{loadError ? "History unavailable" : "No saved workflows"}</p>
            ) : (
              <ul className="workflow-history">
                {workflows.map((workflow) => (
                  <Row as="li" key={workflow.id} gap="4" vertical="center">
                    <button
                      type="button"
                      className="history-item"
                      aria-pressed={current?.id === workflow.id}
                      onClick={() => {
                        if (workflow.id === currentId) return;
                        setCurrentId(workflow.id);
                        setSelection({ stage: "idea" });
                        setCanvasSession((session) => session + 1);
                      }}
                    >
                      <Icon name="document" size="s" decorative />
                      <span>
                        <strong title={workflow.request}>{workflow.request}</strong>
                        <small>{workflowProviders[workflow.provider]}</small>
                      </span>
                    </button>
                    <IconButton
                      type="button"
                      icon="trash"
                      variant="tertiary"
                      size="s"
                      tone="danger"
                      disabled={isWorkflowRunning(workflow)}
                      tooltip="Delete workflow"
                      aria-label={`Delete workflow: ${workflow.request}`}
                      onClick={() => {
                        setDeleteError("");
                        setDeleteTarget(workflow);
                      }}
                    />
                  </Row>
                ))}
              </ul>
            )}
          </aside>

          {current ? (
            <>
              <div className="workflow-workspace">
                <header className="workspace-header">
                  <div>
                    <h2 title={current.request}>{current.request}</h2>
                    <div className="workspace-meta">
                      <span>{workflowProviders[current.provider]}</span>
                      <span title={current.workspacePath}>
                        {workspaceName ?? current.workspacePath}
                      </span>
                    </div>
                  </div>
                  <Row gap="8" vertical="center" horizontal="end" wrap>
                    <span className="draft-label">Saved locally</span>
                    <ProviderQuota
                      key={current.provider}
                      provider={current.provider}
                      readQuota={api.providerQuota}
                      providerRunning={isWorkflowRunning(current)}
                    />
                    <Button
                      type="button"
                      size="s"
                      variant="secondary"
                      onClick={() => void openWorkspaceInCursor(current.id)}
                    >
                      Open in Cursor
                    </Button>
                    <Button
                      type="button"
                      size="s"
                      variant="secondary"
                      suffixIcon={inspectorOpen ? "chevronRight" : "chevronLeft"}
                      data-guide="workflow-details"
                      aria-controls="workflow-details"
                      aria-expanded={inspectorOpen}
                      onClick={() => setInspectorOpen((open) => !open)}
                    >
                      {inspectorOpen ? "Hide details" : "Show details"}
                    </Button>
                  </Row>
                </header>
                <WorkflowGraph
                  key={canvasSession}
                  workflowId={current.id}
                  hasWorkflow
                  plan={current.plan}
                  build={current.build}
                  milestones={current.milestones}
                  stageSettings={current.stageSettings}
                  canvasStyle={canvasStyle}
                  onCanvasStyleChange={(style) => {
                    setCanvasStyle(style);
                    try {
                      localStorage.setItem(canvasStyleStorageKey, style);
                    } catch {
                      // The selected style still applies for this session.
                    }
                  }}
                  selection={selection}
                  onSelect={(next) => {
                    setSelection(next);
                    if (next.milestoneId || next.section === "new" || next.queue)
                      setInspectorOpen(true);
                  }}
                  onAddMilestone={() => {
                    setSelection({ stage: "build", milestoneId: "new" });
                    setInspectorOpen(true);
                  }}
                />
              </div>
              <aside
                id="workflow-details"
                ref={inspector}
                className="workflow-inspector"
                aria-label="Workflow details"
                hidden={!inspectorOpen}
              >
                {selection.milestoneId === "new" || selectedMilestone ? (
                  <WorkflowMilestoneDetails
                    key={`${current.id}/${selection.milestoneId}`}
                    milestone={selectedMilestone}
                    workflow={current}
                    onSave={async (input) => {
                      const updated = await api.saveMilestone(
                        current.id,
                        selectedMilestone?.id ?? null,
                        input,
                      );
                      updateWorkflow(updated);
                      if (!selectedMilestone && inspectedWorkflow.current === current.id) {
                        const added = updated.milestones?.at(-1);
                        setSelection((selected) =>
                          selected.milestoneId === "new" && added
                            ? { stage: "build", milestoneId: added.id }
                            : selected,
                        );
                      }
                    }}
                    onRun={async () => {
                      if (selectedMilestone)
                        updateWorkflow(await api.runMilestone(current.id, selectedMilestone.id));
                    }}
                    onRemove={async () => {
                      if (!selectedMilestone) return;
                      updateWorkflow(await api.removeMilestone(current.id, selectedMilestone.id));
                      if (inspectedWorkflow.current === current.id) {
                        setSelection((selected) =>
                          selected.milestoneId === selectedMilestone.id
                            ? { stage: "build" }
                            : selected,
                        );
                      }
                    }}
                    onCancel={() => setSelection({ stage: "build" })}
                  />
                ) : (
                  <WorkflowDetails
                    key={`${current.id}/${selection.stage}/${selection.section ?? ""}/${selection.taskId ?? ""}/${Boolean(selection.queue)}`}
                    workflow={current}
                    selection={selection}
                    saveStageSettings={async (settings) => {
                      updateWorkflow(
                        await api.saveStageSettings(current.id, selection.stage, settings),
                      );
                    }}
                    openMilestone={(id) => setSelection({ stage: "build", milestoneId: id })}
                    openBuildTask={(taskId) => setSelection({ stage: "build", taskId })}
                    closeSection={() => setSelection({ stage: selection.stage })}
                    editSection={async (change) => {
                      const stage = selection.stage;
                      const updated = await api.editWorkflowSection(current.id, stage, change);
                      updateWorkflow(updated);
                      if (inspectedWorkflow.current !== current.id) return;
                      setSelection((selected) => {
                        if (selected.stage !== stage || selected.section !== selection.section)
                          return selected;
                        if (change.action === "remove") return { stage };
                        if (change.id !== null) return selected;
                        const section = workflowSections(stage, updated.stageSettings).at(-1);
                        return section ? { stage, section: section.id } : { stage };
                      });
                    }}
                    openJiraLink={api.openJiraLink}
                    loadIssue={api.linkedIssue}
                    openPlanReview={() => openPlanReview(current.id)}
                    exportTranscript={exportTranscript}
                    readTranscript={api.readTranscript}
                    readCommitDiff={api.readBuildCommitDiff}
                    retryPlan={() => retryPlan(current.id)}
                    answerPlan={(answer) => answerPlan(current.id, answer)}
                    startBuild={async (commitBaseline) => {
                      updateWorkflow(
                        await (commitBaseline
                          ? api.startBuild(current.id, true)
                          : api.startBuild(current.id)),
                      );
                    }}
                    reviewBuildTask={async (input) => {
                      updateWorkflow(await api.reviewBuildTask(current.id, input));
                      if (!input.feedback && inspectedWorkflow.current === current.id) {
                        setSelection((selected) =>
                          selected.taskId === input.taskId ? { stage: "build" } : selected,
                        );
                      }
                    }}
                  />
                )}
              </aside>
            </>
          ) : loading || loadError ? (
            <Column className="workflow-empty" padding="l" horizontal="center" vertical="center">
              {loading ? (
                <Text role="status">Opening workflow history…</Text>
              ) : (
                <Feedback tone="danger" title="Workflow history" description={loadError}>
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
                </Feedback>
              )}
            </Column>
          ) : (
            <WorkflowOnboarding
              newWorkflowButton={newWorkflowButton}
              onNewWorkflow={() => setIntakeOpen(true)}
              onStartGuide={() => startGuide("workflows")}
            />
          )}
        </main>
      </Activity>
      {guideOrigin && <AppGuide hasWorkflow={Boolean(current)} onClose={closeGuide} />}
      {deleteTarget && (
        <Dialog
          open
          title="Delete workflow?"
          description={`“${deleteTarget.request}” and its saved history will be permanently removed from this app.`}
          closeOnClickaway={false}
          showClose={!deleting}
          onClose={() => {
            if (!deleting) setDeleteTarget(undefined);
          }}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={deleting}
                onClick={() => setDeleteTarget(undefined)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                tone="danger"
                loading={deleting}
                disabled={deleting}
                onClick={() => void removeWorkflow()}
              >
                Permanently delete
              </Button>
            </>
          }
        >
          {deleteError && <Feedback tone="danger" description={deleteError} />}
        </Dialog>
      )}
      {intakeOpen && (
        <WorkflowForm
          open={page === "workflows"}
          onClose={() => setIntakeOpen(false)}
          api={api}
          defaultProvider={defaultProvider}
          knowledge={knowledge}
          onOpenKnowledge={() => setPage("knowledge")}
          onCreated={(workflow) => {
            setIntakeOpen(false);
            showNewWorkflow(workflow);
          }}
        />
      )}
      {review && (
        <Dialog
          data-workflow-plan-review
          open
          title="Review plan"
          description={`Step 3 of 3 · ${review.request}`}
          onClose={() => {
            if (!approving) setReviewId(undefined);
          }}
          closeOnClickaway={false}
          maxWidth="58rem"
          footer={
            <Row gap="8" wrap horizontal="end">
              <Button
                type="button"
                variant="secondary"
                disabled={approving}
                onClick={() => setReviewId(undefined)}
              >
                Return to workflow
              </Button>
              {review.plan?.state === "ready" && review.plan.review && (
                <Button
                  type="button"
                  suffixIcon="arrowRight"
                  loading={approving}
                  disabled={approving}
                  onClick={() => void continueToBuild(review)}
                >
                  {review.build ? "Open Build" : "Approve plan and continue to Build"}
                </Button>
              )}
            </Row>
          }
        >
          <ProviderMessages
            key={`messages:${review.id}`}
            workflow={review}
            live={isWorkflowRunning(review)}
            readTranscript={api.readTranscript}
            exportTranscript={exportTranscript}
          />
          {review.source && review.plan && !isWorkflowRunning(review) && (
            <PlanReplay
              key={`replay:${review.id}`}
              workflow={review}
              loadOptions={api.planningOptions}
              replay={(input) => replayPlan(review.id, input)}
            />
          )}
          <WorkflowPlanContent
            key={review.id}
            workflow={review}
            retryPlan={() => retryPlan(review.id)}
            answerPlan={(answer) => answerPlan(review.id, answer)}
            generateReview={async () => updateWorkflow(await api.generatePlanReview(review.id))}
            detailed
          />
          {approvalError && <Feedback tone="danger" description={approvalError} />}
        </Dialog>
      )}
      {page === "settings" && (
        <SettingsPage
          desktop={desktop}
          initialTab={settingsTab}
          guideButton={settingsGuideButton}
          onStartGuide={() => startGuide("settings")}
          checkJira={() => api.assignedSprintIssues(true)}
          defaultProvider={defaultProvider}
          onProviderChange={(provider) => {
            localStorage.setItem(defaultProviderKey, provider);
            setDefaultProvider(provider);
          }}
          onMascotChange={(design) => {
            localStorage.setItem(mascotStorageKey, JSON.stringify(design));
            setMascotDesign(design);
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
            if (!intakeOpen) requestAnimationFrame(() => knowledgeButton.current?.focus());
          }}
        />
      )}
    </MascotDesignContext>
  );
}
