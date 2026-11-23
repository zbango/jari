import type {
  WorkflowBuild,
  WorkflowBuildTask,
  WorkflowMilestone,
  WorkflowPlan,
  WorkflowRecord,
  WorkflowStageSettings,
} from "@agent-desktop/shared";
import { workflowSections } from "@agent-desktop/shared";
import { Background as SurfaceBackground } from "@once-ui-system/core/components/Background";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { ConfirmButton } from "@once-ui-system/core/components/ConfirmButton";
import { Icon } from "@once-ui-system/core/components/Icon";
import { IconButton } from "@once-ui-system/core/components/IconButton";
import { SegmentedControl } from "@once-ui-system/core/components/SegmentedControl";
import { Text } from "@once-ui-system/core/components/Text";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import type { Edge, FitViewOptions, Node, NodeChangeset, NodeProps, Viewport } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { buildTaskStatus, stageOrder, stages, stageStatus } from "./stages";
import type { Selection, Stage, WorkflowStatusKind } from "./stages";
import { readCanvasLayouts, saveCanvasLayouts } from "./workflow-canvas-layout";
import type { CanvasNodeLayout } from "./workflow-canvas-layout";
import { canvasGeometry, canvasStyles } from "./workflow-canvas-style";
import type { CanvasStyle } from "./workflow-canvas-style";
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
  vertical: boolean;
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
type TaskQueueNode = Node<
  {
    shown: boolean;
    expanded: boolean;
    selected: boolean;
    count: number;
    select(): void;
    toggle(): void;
  },
  "taskQueue"
>;
type MilestoneNode = Node<
  {
    milestone: WorkflowMilestone;
    vertical: boolean;
    blocked: boolean;
    selected: boolean;
    select(): void;
  },
  "milestone"
>;
type AddNode = Node<{ vertical: boolean; select(): void }, "addMilestone">;

function ResizeHandles({
  selected,
  draggable,
  minWidth,
  minHeight,
}: {
  selected: boolean;
  draggable: boolean;
  minWidth: number;
  minHeight: number;
}) {
  return draggable && selected ? (
    <NodeResizer minWidth={minWidth} minHeight={minHeight} color="var(--accent)" />
  ) : null;
}

function MilestoneCard({ data, selected: layoutSelected, draggable }: NodeProps<MilestoneNode>) {
  const { milestone, blocked, selected, select } = data;
  const status = milestoneDisplayStatus(milestone, blocked);
  return (
    <div
      className="workflow-node workflow-milestone-node"
      data-selected={selected}
      data-kind={status.kind}
    >
      <ResizeHandles
        selected={layoutSelected}
        draggable={draggable}
        minWidth={150}
        minHeight={78}
      />
      <Handle type="target" position={data.vertical ? Position.Top : Position.Left} />
      <button
        className="workflow-node-main nopan"
        type="button"
        aria-label={`Inspect milestone ${milestone.title}`}
        inert={draggable}
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
      <Handle type="source" position={data.vertical ? Position.Bottom : Position.Right} />
    </div>
  );
}

function AddMilestoneCard({ data }: NodeProps<AddNode>) {
  return (
    <div className="workflow-add-node">
      <Handle type="target" position={data.vertical ? Position.Top : Position.Left} />
      <button className="nopan" type="button" onClick={data.select}>
        <Icon name="plus" size="s" decorative />
        Add milestone
      </button>
    </div>
  );
}

function StageCard({ data, selected, draggable }: NodeProps<StageNode>) {
  const stage = stages[data.stage];
  const title = data.settings?.title ?? stage.title;
  const description = data.settings?.description ?? stage.description;
  const status = stageStatus(data.stage, data.hasWorkflow, data.plan, data.build);
  return (
    <div
      className="workflow-node"
      data-selected={data.selected}
      data-stage={data.stage}
      data-kind={status.kind}
    >
      <ResizeHandles selected={selected} draggable={draggable} minWidth={150} minHeight={78} />
      <Handle type="target" position={data.vertical ? Position.Top : Position.Left} />
      <button
        className="workflow-node-main nopan"
        type="button"
        aria-pressed={data.selected}
        aria-label={`Inspect ${title}`}
        title={description}
        inert={draggable}
      >
        <span className="workflow-node-title">
          <Icon name={stage.icon} size="s" decorative />
          <span className="workflow-task-title" title={title}>
            {title}
          </span>
        </span>
        <span className="workflow-node-description">{description}</span>
      </button>
      <div className="workflow-node-footer">
        <span className="workflow-status" data-kind={status.kind}>
          <Icon name={status.icon} size="xs" decorative />
          {status.label}
        </span>
        <IconButton
          className="graph-icon-button nopan"
          type="button"
          size="xs"
          variant="ghost"
          icon={data.expanded ? "chevronUp" : "chevronDown"}
          aria-label={`${data.expanded ? "Collapse" : "Expand"} ${title}`}
          aria-expanded={data.expanded}
          inert={draggable}
          onClick={(event) => {
            event.stopPropagation();
            data.toggle();
          }}
        />
      </div>
      <Handle type="source" position={data.vertical ? Position.Bottom : Position.Right} />
      <Handle
        type="source"
        id="sections"
        position={data.vertical ? Position.Right : Position.Bottom}
        className="section-handle"
      />
    </div>
  );
}

function SectionCard({ data, selected, draggable }: NodeProps<SectionNode>) {
  return (
    <div
      className="workflow-section"
      data-add={data.add}
      data-shown={data.shown}
      aria-hidden={!data.shown}
      inert={!data.shown}
    >
      <ResizeHandles selected={selected} draggable={draggable} minWidth={120} minHeight={30} />
      <Handle type="target" position={Position.Left} />
      <button className="nopan" type="button" aria-pressed={data.selected} inert={draggable}>
        <Icon name={data.add ? "plus" : "document"} size="xs" decorative />
        <span className="workflow-task-title" title={data.name}>
          {data.name}
        </span>
      </button>
    </div>
  );
}

function BuildTaskCard({ data, selected: layoutSelected, draggable }: NodeProps<BuildTaskNode>) {
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
      <ResizeHandles
        selected={layoutSelected}
        draggable={draggable}
        minWidth={140}
        minHeight={44}
      />
      <Handle type="target" position={Position.Top} />
      <Handle type="target" id="queue" position={Position.Left} />
      <button
        className="nopan"
        type="button"
        aria-label={`Inspect task ${task.id}: ${task.title}`}
        inert={draggable}
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

function TaskQueueCard({ data, selected, draggable }: NodeProps<TaskQueueNode>) {
  return (
    <div
      className="workflow-section workflow-queue"
      data-shown={data.shown}
      aria-hidden={!data.shown}
      inert={!data.shown}
    >
      <ResizeHandles selected={selected} draggable={draggable} minWidth={144} minHeight={30} />
      <Handle type="target" position={Position.Left} />
      <div className="workflow-queue-body" data-selected={data.selected}>
        <button
          className="workflow-queue-action nopan"
          type="button"
          aria-label="Inspect task queue"
          aria-pressed={data.selected}
          inert={draggable}
        >
          <Icon name="layers" size="xs" decorative />
          <span className="workflow-task-title">Task queue</span>
          <span className="workflow-queue-count">{data.count}</span>
        </button>
        <IconButton
          className="graph-icon-button nopan"
          type="button"
          size="xs"
          variant="ghost"
          icon={data.expanded ? "chevronUp" : "chevronDown"}
          aria-label={data.expanded ? "Collapse task queue" : "Expand task queue"}
          inert={draggable}
          aria-expanded={data.expanded}
          onClick={(event) => {
            event.stopPropagation();
            data.toggle();
          }}
        />
      </div>
      <Handle type="source" position={Position.Right} />
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
  taskQueue: TaskQueueCard,
  milestone: MilestoneCard,
  addMilestone: AddMilestoneCard,
};
type GraphNode = StageNode | SectionNode | BuildTaskNode | TaskQueueNode | MilestoneNode | AddNode;
const taskQueueId = "build:queue";
type Props = {
  workflowId: string;
  selection: Selection;
  hasWorkflow: boolean;
  plan?: WorkflowPlan | undefined;
  build?: WorkflowBuild;
  milestones?: WorkflowMilestone[];
  stageSettings?: WorkflowRecord["stageSettings"];
  canvasStyle: CanvasStyle;
  onCanvasStyleChange(style: CanvasStyle): void;
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
  workflowId,
  selection,
  hasWorkflow,
  plan,
  build,
  milestones = [],
  stageSettings,
  canvasStyle,
  onCanvasStyleChange,
  onSelect,
  onAddMilestone,
}: Props) {
  const [expanded, setExpanded] = useState<Partial<Record<Stage, boolean>>>({});
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const [layoutSelection, setLayoutSelection] = useState<string>();
  const [layouts, setLayouts] = useState(() => readCanvasLayouts(workflowId));
  const latestLayouts = useRef(layouts);
  const [focus, setFocus] = useState<Stage | null>(null);
  const overview = useRef<Viewport | null>(null);
  const flow = useReactFlow<GraphNode>();
  const updateNodeInternals = useUpdateNodeInternals();
  const geometry = canvasGeometry[canvasStyle];
  const vertical = canvasStyle === "timeline";
  const tasks = build?.tasks ?? [];
  const queueOpen = queueExpanded || selection.taskId !== undefined;
  const stageDetails = Object.fromEntries(
    stageOrder.map((stage) => [
      stage,
      [
        ...workflowSections(stage, stageSettings),
        ...(stage === "build" && tasks.length ? [{ id: "queue", title: "Task queue" }] : []),
        { id: "new", title: "Add detail" },
      ],
    ]),
  );
  const before = milestones.filter(({ timing }) => timing === "before-build");
  const after = milestones.filter(({ timing }) => timing === "after-build");
  const followUps = milestones.filter(({ timing }) => timing === "follow-up");
  const path = ["idea", "plan", ...before, "build", ...after, ...followUps] as const;
  const pathIds = path.map((entry) =>
    typeof entry === "string" ? entry : `milestone:${entry.id}`,
  );
  const pathKey = pathIds.join("/");
  const previousPath = useRef(pathKey);
  const previousStyle = useRef(canvasStyle);

  function isExpanded(stage: Stage, selected = selection) {
    const preference = stageSettings?.[stage]?.expandDetails;
    if (expanded[stage] !== undefined) return expanded[stage];
    if (preference && preference !== "default") return preference === "expanded";
    return (
      (selected.stage === stage && !selected.milestoneId) || (stage === "build" && tasks.length > 0)
    );
  }

  function sectionIds(stage: Stage) {
    return stageDetails[stage]!.flatMap(({ id }) =>
      stage === "build" && id === "queue" && queueExpanded
        ? [taskQueueId, ...tasks.map((task) => `build:task-${task.id}`)]
        : [`${stage}:${id}`],
    );
  }

  function toggle(stage: Stage) {
    setExpanded({ ...expanded, [stage]: !isExpanded(stage) });
    if (
      isExpanded(stage) &&
      selection.stage === stage &&
      (selection.section || selection.taskId || selection.queue)
    ) {
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
      } else {
        requestAnimationFrame(() => void flow.fitView({ ...overviewFit.current, duration }));
      }
    }
  }

  const nodes: GraphNode[] = [];
  const edges: Edge[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  let pathOffset = 0;
  for (const [index, entry] of path.entries()) {
    positions.set(pathIds[index]!, vertical ? { x: 0, y: pathOffset } : { x: pathOffset, y: 0 });
    if (!vertical) {
      pathOffset += geometry.cardWidth + geometry.pathGap;
      continue;
    }
    const details = typeof entry === "string" && isExpanded(entry) ? stageDetails[entry]! : [];
    const queueRow =
      entry === "build" && queueOpen ? details.findIndex(({ id }) => id === "queue") : -1;
    const queueLength =
      queueRow < 0 ? 0 : queueRow * geometry.detailStep + tasks.length * geometry.taskStep;
    const branchLength = details.length
      ? geometry.branchOffset + Math.max(details.length * geometry.detailStep, queueLength)
      : 0;
    pathOffset += Math.max(geometry.cardHeight, branchLength) + geometry.pathGap;
  }
  for (const stage of stageOrder) {
    const position = positions.get(stage)!;
    const detailsX =
      position.x + (vertical ? geometry.cardWidth + 64 : geometry.cardWidth - geometry.detailWidth);
    const branchY = position.y + (vertical ? 0 : geometry.cardHeight) + geometry.branchOffset;
    const shown = focus === null || focus === stage;
    nodes.push({
      id: stage,
      type: "stage",
      position,
      width: geometry.cardWidth,
      height: geometry.cardHeight,
      hidden: !shown,
      data: {
        stage,
        vertical,
        expanded: isExpanded(stage),
        selected:
          selection.stage === stage &&
          !selection.section &&
          !selection.taskId &&
          !selection.queue &&
          !selection.milestoneId,
        hasWorkflow,
        plan,
        build,
        settings: stageSettings?.[stage],
        select: () => onSelect({ stage }),
        toggle: () => toggle(stage),
      },
    });

    const detailsExpanded = isExpanded(stage);
    for (const [row, { id: section, title: name }] of stageDetails[stage]!.entries()) {
      const id = `${stage}:${section}`;
      const detailPosition = { x: detailsX, y: branchY + row * geometry.detailStep };
      const isQueue = id === taskQueueId;
      edges.push({
        id: isQueue ? "build-queue-branch" : `${stage}-${id}`,
        source: stage,
        sourceHandle: "sections",
        target: id,
        type: "smoothstep",
        className: detailsExpanded ? "workflow-section-link" : "workflow-section-link is-collapsed",
      });
      if (!isQueue) {
        nodes.push({
          id,
          type: "section",
          position: detailPosition,
          width: geometry.detailWidth,
          height: geometry.detailHeight,
          hidden: !shown,
          data: {
            name,
            add: section === "new",
            shown: detailsExpanded,
            selected: selection.stage === stage && selection.section === section,
            select: () => onSelect({ stage, section }),
          },
        });
        continue;
      }
      nodes.push({
        id: taskQueueId,
        type: "taskQueue",
        position: detailPosition,
        width: geometry.detailWidth,
        height: geometry.detailHeight,
        hidden: !shown,
        data: {
          shown: detailsExpanded,
          expanded: queueOpen,
          selected: selection.stage === "build" && !!selection.queue,
          count: tasks.length,
          select: () => {
            setQueueExpanded(true);
            onSelect({ stage: "build", queue: true });
          },
          toggle: () => {
            setQueueExpanded(!queueOpen);
            if (selection.taskId) onSelect({ stage: "build", queue: true });
          },
        },
      });
      for (const [index, task] of tasks.entries()) {
        const id = `build:task-${task.id}`;
        const taskShown = detailsExpanded && queueOpen;
        nodes.push({
          id,
          type: "buildTask",
          parentId: taskQueueId,
          position: {
            x: geometry.detailWidth + 46,
            y: (geometry.detailHeight - geometry.taskHeight) / 2 + index * geometry.taskStep,
          },
          width: geometry.cardWidth,
          height: geometry.taskHeight,
          hidden: !shown,
          data: {
            task,
            shown: taskShown,
            selected: selection.stage === "build" && selection.taskId === task.id,
            select: () => onSelect({ stage: "build", taskId: task.id }),
          },
        });
        const previous = tasks[index - 1];
        edges.push({
          id: `build-step-${task.id}`,
          source: previous ? `build:task-${previous.id}` : taskQueueId,
          target: id,
          targetHandle: previous ? undefined : "queue",
          type: "smoothstep",
          ...flowLink(buildTaskStatus[task.state].kind, "workflow-section-link", !taskShown),
        });
      }
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
        position: positions.get(id)!,
        width: geometry.cardWidth,
        height: geometry.cardHeight,
        hidden: focus !== null,
        data: {
          milestone: entry,
          vertical,
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
        type: canvasStyle === "map" ? "straight" : "smoothstep",
        ...flowLink(kind, "workflow-stage-link"),
      });
    }
  }
  nodes.push({
    id: "add-milestone",
    type: "addMilestone",
    position: vertical
      ? { x: (geometry.cardWidth - 156) / 2, y: pathOffset }
      : { x: pathOffset, y: (geometry.cardHeight - 48) / 2 },
    width: 156,
    height: 48,
    hidden: focus !== null,
    data: { vertical, select: onAddMilestone },
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

  const edits = layouts[canvasStyle] ?? {};
  const arrangedNodes: GraphNode[] = nodes.map((node) => {
    const adjustable = node.type !== "addMilestone" && !(node.type === "section" && node.data.add);
    const editable = editingLayout && adjustable && (!("shown" in node.data) || node.data.shown);
    return {
      ...node,
      ...(adjustable ? edits[node.id] : undefined),
      draggable: editable,
      selectable: editable,
      selected: editable && layoutSelection === node.id,
      focusable: editable,
    };
  });

  function applyLayoutChanges(changes: NodeChangeset<GraphNode>) {
    if (!editingLayout) return;
    const current = latestLayouts.current;
    const updates: Record<string, CanvasNodeLayout> = { ...current[canvasStyle] };
    let hasChanges = false;
    const resizing = changes.getByType("dimensions").some((change) => change.resizing);
    let finished = false;
    for (const change of changes) {
      if (change.type === "select") {
        setLayoutSelection((id) =>
          change.selected ? change.id : id === change.id ? undefined : id,
        );
      } else if (change.type === "position" && change.position) {
        updates[change.id] = { ...updates[change.id], position: change.position };
        hasChanges = true;
        finished ||= change.dragging !== true && !resizing;
      } else if (
        change.type === "dimensions" &&
        change.resizing !== undefined &&
        change.dimensions
      ) {
        updates[change.id] = { ...updates[change.id], ...change.dimensions };
        hasChanges = true;
        finished ||= !change.resizing;
      }
    }
    if (!hasChanges) return;
    const next = { ...current, [canvasStyle]: updates };
    latestLayouts.current = next;
    setLayouts(next);
    if (finished) saveCanvasLayouts(workflowId, next);
  }

  function resetLayout() {
    const { [canvasStyle]: _removed, ...remaining } = latestLayouts.current;
    latestLayouts.current = remaining;
    setLayouts(remaining);
    setLayoutSelection(undefined);
    saveCanvasLayouts(workflowId, remaining);
    requestAnimationFrame(() => void flow.fitView(overviewFit.current));
  }

  const visibleNodes = arrangedNodes.filter(
    (node) => !node.hidden && (!("shown" in node.data) || node.data.shown),
  );
  const fitViewOptions: FitViewOptions<GraphNode> = {
    nodes: visibleNodes.map(({ id }) => ({ id })),
    padding: { top: "92px", bottom: "24px", left: "24px", right: "24px" },
    maxZoom: 1.08,
  };
  const overviewFit = useRef(fitViewOptions);
  const nodeIds = useRef<string[]>([]);
  useEffect(() => {
    overviewFit.current = fitViewOptions;
    nodeIds.current = nodes.map(({ id }) => id);
  });

  useEffect(() => {
    if (previousPath.current === pathKey) return;
    previousPath.current = pathKey;
    if (!focus) void flow.fitView(overviewFit.current);
  }, [flow, focus, pathKey]);

  useEffect(() => {
    if (previousStyle.current === canvasStyle) return;
    previousStyle.current = canvasStyle;
    overview.current = null;
    updateNodeInternals(nodeIds.current);
    const frame = requestAnimationFrame(() => void flow.fitView(overviewFit.current));
    return () => cancelAnimationFrame(frame);
  }, [canvasStyle, flow, updateNodeInternals]);

  return (
    <section
      className="workflow-canvas"
      aria-label="Workflow canvas"
      data-workflow-canvas
      data-canvas-style={canvasStyle}
      data-layout-editing={editingLayout}
    >
      {canvasStyle === "compact" && (
        <SurfaceBackground
          aria-hidden
          position="absolute"
          top="0"
          left="0"
          pointerEvents="none"
          gradient={{
            display: true,
            opacity: 30,
            x: "90%",
            y: "0%",
            width: "90%",
            height: "90%",
            colorStart: "brand-alpha-medium",
          }}
        />
      )}
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-group" data-guide="workflow-stages">
          <SegmentedControl
            aria-label="Focus workflow stage"
            semantics="radio"
            compact
            fillWidth={false}
            scroll={false}
            value={focus ?? "overview"}
            buttons={[
              { value: "overview", label: "Overview", size: "s" },
              ...stageOrder.map((stage) => ({
                value: stage,
                label: stageSettings?.[stage]?.title ?? stages[stage].title,
                size: "s" as const,
              })),
            ]}
            onValueChange={(value) =>
              changeFocus(stageOrder.find((stage) => stage === value) ?? null)
            }
          />
        </div>
        <div className="canvas-toolbar-group" data-guide="canvas-style">
          <SegmentedControl
            aria-label="Canvas style"
            semantics="radio"
            compact
            fillWidth={false}
            scroll={false}
            value={canvasStyle}
            buttons={canvasStyles.map((style) => ({ ...style, size: "s" }))}
            onValueChange={(value) => {
              const style = canvasStyles.find((option) => option.value === value);
              if (style) {
                setLayoutSelection(undefined);
                onCanvasStyleChange(style.value);
              }
            }}
          />
        </div>
        <div className="canvas-layout-actions">
          <Button
            variant={editingLayout ? "primary" : "secondary"}
            size="s"
            type="button"
            aria-pressed={editingLayout}
            prefixIcon="adjustments"
            onClick={() => {
              if (editingLayout) saveCanvasLayouts(workflowId, latestLayouts.current);
              setEditingLayout((current) => !current);
              setLayoutSelection(undefined);
            }}
          >
            {editingLayout ? "Done editing" : "Edit layout"}
          </Button>
          {editingLayout && Object.keys(edits).length > 0 && (
            <ConfirmButton
              label="Reset layout"
              labels={{ confirm: "Confirm reset" }}
              type="button"
              size="s"
              variant="secondary"
              prefixIcon="refresh"
              onConfirm={resetLayout}
            />
          )}
        </div>
        {editingLayout && (
          <Text
            className="canvas-layout-hint"
            textVariant="label-default-s"
            onBackground="neutral-weak"
          >
            Drag to move. Select a node to resize.
          </Text>
        )}
      </div>
      <ReactFlow
        nodes={arrangedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (editingLayout) return;
          if (node.type === "milestone" || node.type === "addMilestone") return;
          if (node.type === "stage" || node.data.shown) node.data.select();
        }}
        onNodesChange={applyLayoutChanges}
        onNodeDragStop={() => saveCanvasLayouts(workflowId, latestLayouts.current)}
        nodesDraggable={editingLayout}
        nodesConnectable={false}
        nodesFocusable={editingLayout}
        edgesFocusable={false}
        elementsSelectable={editingLayout}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        minZoom={0.25}
        fitView
        fitViewOptions={fitViewOptions}
        proOptions={{ hideAttribution: true }}
      >
        {canvasStyle !== "compact" && (
          <Background
            variant={vertical ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            gap={vertical ? 32 : 21}
            size={1.3}
            lineWidth={1}
            color="var(--graph-dot)"
          />
        )}
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
