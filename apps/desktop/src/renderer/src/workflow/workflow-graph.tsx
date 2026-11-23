import type {
  WorkflowBuild,
  WorkflowBuildTask,
  WorkflowMilestone,
  WorkflowPlan,
  WorkflowRecord,
  WorkflowStageSettings,
} from "@agent-desktop/shared";
import { workflowSections } from "@agent-desktop/shared";
import { Column } from "@once-ui-system/core/components/Column";
import { Icon } from "@once-ui-system/core/components/Icon";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import type { Edge, FitViewOptions, Node, NodeProps, Viewport } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { buildTaskStatus, stageOrder, stages, stageStatus } from "./stages";
import type { Selection, Stage, WorkflowStatusKind } from "./stages";
import {
  milestoneDisplayStatus,
  milestoneIsBlocked,
  milestoneTimings,
} from "./workflow-milestones";

type StageNodeData = {
  stage: Stage;
  expanded: boolean;
  selected: boolean;
  hasWorkflow: boolean;
  plan?: WorkflowPlan | undefined;
  build?: WorkflowBuild;
  settings?: Partial<WorkflowStageSettings>;
  select(): void;
  toggle(): void;
};

type StageNode = Node<StageNodeData, "stage">;
type SectionNode = Node<
  {
    name: string;
    shown: boolean;
    selected: boolean;
    add?: boolean;
    select(): void;
  },
  "section"
>;
type BuildTaskNode = Node<
  {
    task: WorkflowBuildTask;
    shown: boolean;
    selected: boolean;
    select(): void;
  },
  "buildTask"
>;
type MilestoneNode = Node<
  {
    milestone: WorkflowMilestone;
    blocked: boolean;
    selected: boolean;
    select(): void;
  },
  "milestone"
>;
type AddNode = Node<{ select(): void }, "addMilestone">;

function MilestoneCard({ data }: NodeProps<MilestoneNode>) {
  const { milestone, blocked, selected, select } = data;
  const status = milestoneDisplayStatus(milestone, blocked);
  return (
    <div
      className="workflow-node workflow-milestone-node"
      data-selected={selected}
      data-kind={status.kind}
    >
      <Handle type="target" position={Position.Left} />
      <button
        className="workflow-node-main nopan"
        type="button"
        aria-label={`Inspect milestone ${milestone.title}`}
        aria-pressed={selected}
        onClick={select}
      >
        <span className="milestone-timing">
          {milestoneTimings[milestone.timing]}
          {milestone.action === "checkpoint" && " · Checkpoint"}
        </span>
        <span className="workflow-node-title">
          <span className="milestone-diamond" aria-hidden="true" />
          <span className="milestone-title" title={milestone.title}>
            {milestone.title}
          </span>
        </span>
        <span className="workflow-status" data-kind={status.kind}>
          <Icon name={status.icon} size="xs" decorative />
          {status.label}
        </span>
      </button>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function AddMilestoneCard({ data }: NodeProps<AddNode>) {
  return (
    <div className="workflow-add-node">
      <Handle type="target" position={Position.Left} />
      <button className="nopan" type="button" onClick={data.select}>
        <Icon name="plus" size="s" decorative />
        Add milestone
      </button>
    </div>
  );
}

function StageCard({ data }: NodeProps<StageNode>) {
  const stage = stages[data.stage];
  const title = data.settings?.title ?? stage.title;
  const status = stageStatus(data.stage, data.hasWorkflow, data.plan, data.build);
  return (
    <div
      className="workflow-node"
      data-selected={data.selected}
      data-stage={data.stage}
      data-kind={status.kind}
    >
      <Handle type="target" position={Position.Left} />
      <button
        className="workflow-node-main nopan"
        type="button"
        aria-pressed={data.selected}
        aria-label={`Inspect ${title}`}
      >
        <span className="workflow-node-title">
          <Icon name={stage.icon} size="s" decorative />
          <span className="workflow-task-title" title={title}>
            {title}
          </span>
        </span>
        <span className="workflow-node-description">
          {data.settings?.description ?? stage.description}
        </span>
      </button>
      <div className="workflow-node-footer">
        <span className="workflow-status" data-kind={status.kind}>
          <Icon name={status.icon} size="xs" decorative />
          {status.label}
        </span>
        <button
          className="graph-icon-button nopan"
          type="button"
          aria-label={`${data.expanded ? "Collapse" : "Expand"} ${title}`}
          aria-expanded={data.expanded}
          onClick={(event) => {
            event.stopPropagation();
            data.toggle();
          }}
        >
          <Icon name={data.expanded ? "chevronUp" : "chevronDown"} size="xs" decorative />
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" id="sections" position={Position.Bottom} className="section-handle" />
    </div>
  );
}

function SectionCard({ data }: NodeProps<SectionNode>) {
  return (
    <div
      className="workflow-section"
      data-add={data.add}
      data-shown={data.shown}
      aria-hidden={!data.shown}
      inert={!data.shown}
    >
      <Handle type="target" position={Position.Left} />
      <button className="nopan" type="button" aria-pressed={data.selected}>
        <Icon name={data.add ? "plus" : "document"} size="xs" decorative />
        <span className="workflow-task-title" title={data.name}>
          {data.name}
        </span>
      </button>
    </div>
  );
}

function BuildTaskCard({ data }: NodeProps<BuildTaskNode>) {
  const { task, shown, selected } = data;
  const status = buildTaskStatus[task.state];
  return (
    <div
      className="workflow-section workflow-task"
      data-kind={status.kind}
      data-shown={shown}
      aria-hidden={!shown}
      inert={!shown}
    >
      <Handle type="target" position={Position.Top} />
      <button
        className="nopan"
        type="button"
        aria-label={`Inspect task ${task.id}: ${task.title}`}
        aria-pressed={selected}
      >
        <Column gap="4" minWidth="0">
          <span className="workflow-task-title" title={task.title}>
            {task.id}. {task.title}
          </span>
          <span className="workflow-status" data-kind={status.kind}>
            <Icon name={status.icon} size="xs" decorative />
            {status.label}
          </span>
        </Column>
      </button>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const linkColors: Record<WorkflowStatusKind, string> = {
  waiting: "var(--graph-link)",
  running: "var(--graph-active)",
  review: "var(--graph-review)",
  saved: "var(--saved)",
  failed: "var(--graph-error)",
  blocked: "var(--graph-link)",
};

function flowLink(kind: WorkflowStatusKind, className: string, collapsed = false) {
  return {
    animated: kind === "running" && !collapsed,
    markerEnd: { type: MarkerType.ArrowClosed, color: linkColors[kind] },
    className: `${className} workflow-link--${kind}${collapsed ? " is-collapsed" : ""}`,
  };
}

const nodeTypes = {
  stage: StageCard,
  section: SectionCard,
  buildTask: BuildTaskCard,
  milestone: MilestoneCard,
  addMilestone: AddMilestoneCard,
};
type GraphNode = StageNode | SectionNode | BuildTaskNode | MilestoneNode | AddNode;
type Props = {
  selection: Selection;
  hasWorkflow: boolean;
  plan?: WorkflowPlan | undefined;
  build?: WorkflowBuild;
  milestones?: WorkflowMilestone[];
  stageSettings?: WorkflowRecord["stageSettings"];
  onSelect(selection: Selection): void;
  onAddMilestone(): void;
};

export function WorkflowGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({
  selection,
  hasWorkflow,
  plan,
  build,
  milestones = [],
  stageSettings,
  onSelect,
  onAddMilestone,
}: Props) {
  const [expanded, setExpanded] = useState<Partial<Record<Stage, boolean>>>({});
  const [focus, setFocus] = useState<Stage | null>(null);
  const overview = useRef<Viewport | null>(null);
  const flow = useReactFlow<GraphNode>();
  const tasks = build?.tasks ?? [];
  const before = milestones.filter(({ timing }) => timing === "before-build");
  const after = milestones.filter(({ timing }) => timing === "after-build");
  const followUps = milestones.filter(({ timing }) => timing === "follow-up");
  const path = ["idea", "plan", ...before, "build", ...after, ...followUps] as const;
  const pathIds = path.map((entry) =>
    typeof entry === "string" ? entry : `milestone:${entry.id}`,
  );
  const pathKey = pathIds.join("/");
  const previousPath = useRef(pathKey);

  function isExpanded(stage: Stage, selected = selection) {
    const preference = stageSettings?.[stage]?.expandDetails;
    if (expanded[stage] !== undefined) return expanded[stage];
    if (preference && preference !== "default") return preference === "expanded";
    return (
      (selected.stage === stage && !selected.milestoneId) || (stage === "build" && tasks.length > 0)
    );
  }

  function sectionIds(stage: Stage) {
    return [
      ...(stage === "build" ? tasks.map(({ id }) => `build:task-${id}`) : []),
      ...workflowSections(stage, stageSettings).map(({ id }) => `${stage}:${id}`),
      `${stage}:new`,
    ];
  }

  function toggle(stage: Stage) {
    setExpanded({ ...expanded, [stage]: !isExpanded(stage) });
    if (isExpanded(stage) && selection.stage === stage && (selection.section || selection.taskId)) {
      onSelect({ stage });
    }
  }

  function changeFocus(stage: Stage | null) {
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    if (stage) {
      if (!focus) {
        overview.current = flow.getViewport();
      }
      setFocus(stage);
      onSelect({ stage });
      const visibleNodes = isExpanded(stage, { stage }) ? [stage, ...sectionIds(stage)] : [stage];
      void flow.fitView({
        nodes: visibleNodes.map((id) => ({ id })),
        maxZoom: 1.25,
        duration,
        padding: 0.23,
      });
    } else {
      setFocus(null);
      if (overview.current) {
        void flow.setViewport(overview.current, { duration });
      }
    }
  }

  const nodes: GraphNode[] = [];
  const edges: Edge[] = [];
  for (const stage of stageOrder) {
    const x = pathIds.indexOf(stage) * 256;
    const shown = focus === null || focus === stage;
    nodes.push({
      id: stage,
      type: "stage",
      position: { x, y: 0 },
      width: 200,
      height: 122,
      hidden: !shown,
      data: {
        stage,
        expanded: isExpanded(stage),
        selected:
          selection.stage === stage &&
          !selection.section &&
          !selection.taskId &&
          !selection.milestoneId,
        hasWorkflow,
        plan,
        build,
        settings: stageSettings?.[stage],
        select: () => onSelect({ stage }),
        toggle: () => toggle(stage),
      },
    });

    if (stage === "build" && tasks.length) {
      for (const [index, task] of tasks.entries()) {
        const id = `build:task-${task.id}`;
        const expanded = isExpanded(stage);
        nodes.push({
          id,
          type: "buildTask",
          position: { x, y: 166 + index * 76 },
          width: 200,
          height: 58,
          hidden: !shown,
          data: {
            task,
            shown: expanded,
            selected: selection.stage === "build" && selection.taskId === task.id,
            select: () => onSelect({ stage: "build", taskId: task.id }),
          },
        });
        const previous = tasks[index - 1];
        edges.push({
          id: `build-step-${task.id}`,
          source: previous ? `build:task-${previous.id}` : stage,
          sourceHandle: previous ? undefined : "sections",
          target: id,
          type: "smoothstep",
          ...flowLink(buildTaskStatus[task.state].kind, "workflow-section-link", !expanded),
        });
      }
    }
    const details = [...workflowSections(stage, stageSettings), { id: "new", title: "Add detail" }];
    const detailsY = 166 + (stage === "build" ? tasks.length * 76 : 0);
    for (const [row, { id: section, title: name }] of details.entries()) {
      const id = `${stage}:${section}`;
      nodes.push({
        id,
        type: "section",
        position: { x: x + 26, y: detailsY + row * 47 },
        width: 174,
        height: 36,
        hidden: !shown,
        data: {
          name,
          add: section === "new",
          shown: isExpanded(stage),
          selected: selection.stage === stage && selection.section === section,
          select: () => onSelect({ stage, section }),
        },
      });
      edges.push({
        id: `${stage}-${id}`,
        source: stage,
        sourceHandle: "sections",
        target: id,
        type: "smoothstep",
        className: isExpanded(stage)
          ? "workflow-section-link"
          : "workflow-section-link is-collapsed",
      });
    }
  }

  const workflow = { build, milestones };
  for (const [index, entry] of path.entries()) {
    const id = pathIds[index]!;
    const previous = pathIds[index - 1];
    const blocked = typeof entry !== "string" && milestoneIsBlocked(workflow, entry);
    if (typeof entry !== "string") {
      nodes.push({
        id,
        type: "milestone",
        position: { x: index * 256, y: 0 },
        width: 200,
        height: 122,
        hidden: focus !== null,
        data: {
          milestone: entry,
          blocked,
          selected: selection.milestoneId === entry.id,
          select: () => onSelect({ stage: "build", milestoneId: entry.id }),
        },
      });
    }
    if (previous && !focus) {
      const kind =
        typeof entry === "string"
          ? stageStatus(entry, hasWorkflow, plan, build).kind
          : milestoneDisplayStatus(entry, blocked).kind;
      edges.push({
        id: `${previous}-${id}`,
        source: previous,
        target: id,
        type: "straight",
        ...flowLink(kind, "workflow-stage-link"),
      });
    }
  }
  nodes.push({
    id: "add-milestone",
    type: "addMilestone",
    position: { x: path.length * 256, y: 37 },
    width: 156,
    height: 48,
    hidden: focus !== null,
    data: { select: onAddMilestone },
  });
  if (!focus) {
    edges.push({
      id: "milestone-continuation",
      source: pathIds[pathIds.length - 1]!,
      target: "add-milestone",
      type: "straight",
      className: "workflow-stage-link workflow-continuation",
    });
  }

  const visibleNodes = nodes.filter(
    (node) => !node.hidden && (!("shown" in node.data) || node.data.shown),
  );
  const fitViewOptions: FitViewOptions<GraphNode> = {
    nodes: visibleNodes.map(({ id }) => ({ id })),
    padding: "24px",
    maxZoom: 1.08,
  };
  const overviewFit = useRef(fitViewOptions);
  useEffect(() => {
    overviewFit.current = fitViewOptions;
  });

  useEffect(() => {
    if (previousPath.current === pathKey) return;
    previousPath.current = pathKey;
    if (!focus) void flow.fitView(overviewFit.current);
  }, [flow, focus, pathKey]);

  return (
    <section className="workflow-canvas" aria-label="Workflow canvas" data-workflow-canvas>
      <div className="canvas-toolbar" role="group" aria-label="Focus workflow stage">
        {([null, ...stageOrder] as const).map((stage) => (
          <button
            key={stage ?? "overview"}
            type="button"
            className={focus === stage ? "view-tab is-selected" : "view-tab"}
            aria-pressed={focus === stage}
            onClick={() => changeFocus(stage)}
          >
            {stage ? (stageSettings?.[stage]?.title ?? stages[stage].title) : "Overview"}
          </button>
        ))}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.type === "milestone" || node.type === "addMilestone") return;
          if (node.type === "stage" || node.data.shown) node.data.select();
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        minZoom={0.25}
        fitView
        fitViewOptions={fitViewOptions}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={21} size={1.3} color="var(--graph-dot)" />
        <Controls showInteractive={false} fitViewOptions={fitViewOptions} />
        {milestones.length >= 2 && !focus && (
          <MiniMap
            className="workflow-minimap"
            ariaLabel="Workflow map"
            nodeColor={(node) =>
              "shown" in node.data && !node.data.shown
                ? "transparent"
                : node.type === "milestone" && node.data.selected
                  ? "var(--accent)"
                  : "var(--graph-link)"
            }
            maskColor="var(--surface-selected)"
            pannable
            zoomable
          />
        )}
      </ReactFlow>
    </section>
  );
}
