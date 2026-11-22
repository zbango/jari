import { workflowProviders } from "@agent-desktop/shared";
import type { WorkflowRecord } from "@agent-desktop/shared";
import { Icon } from "@once-ui-system/core/components/Icon";
import { stages, stageStatus } from "./stages";
import type { Selection } from "./stages";

export function WorkflowDetails({
  workflow,
  selection,
}: {
  workflow: WorkflowRecord;
  selection: Selection;
}) {
  const stage = stages[selection.stage];
  const section = Object.entries(stage.sections).find(([id]) => id === selection.section)?.[1];
  const status = stageStatus(selection.stage, true);
  return (
    <>
      {section && <p className="inspector-breadcrumb">{stage.title}</p>}
      <h2>{section ?? stage.title}</h2>
      <span className="workflow-status inspector-status" data-kind={status.kind}>
        <Icon name={status.icon} size="xs" decorative />
        {status.label}
      </span>
      {selection.stage === "idea" ? (
        <>
          {(!selection.section || selection.section === "request") && (
            <div className="inspector-field">
              <h3>Original request</h3>
              <p className="request-body">{workflow.request}</p>
            </div>
          )}
          {(!selection.section || selection.section === "workspace") && (
            <dl className="inspector-field">
              <dt>Provider</dt>
              <dd>{workflowProviders[workflow.provider]}</dd>
              <dt>Workspace</dt>
              <dd className="workspace-path">{workflow.workspacePath}</dd>
            </dl>
          )}
          {selection.section === "context" && (
            <p className="inspector-description">No source references have been collected.</p>
          )}
        </>
      ) : (
        <p className="inspector-description">
          {selection.stage === "plan"
            ? "No plan has been generated for this workflow."
            : "Build requires an approved plan. No execution has started."}
        </p>
      )}
    </>
  );
}
