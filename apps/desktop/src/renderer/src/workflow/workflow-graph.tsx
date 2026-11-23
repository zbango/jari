import type { WorkflowBuild, WorkflowBuildTask, WorkflowPlan } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Icon } from "@once-ui-system/core/components/Icon";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import type { Edge, Node, NodeProps, Viewport } from "@xyflow/react";
import { useRef, useState } from "react";
import { buildTaskStatus, stageOrder, stages, stageStatus } from "./stages";
import type { Selection, Stage } from "./stages";

type StageNodeData = {
  stage: Stage;
  expanded: boolean;
  selected: boolean;
  hasWorkflow: boolean;
  plan?: WorkflowPlan | undefined;
  build?: WorkflowBuild;
  select(): void;
  toggle(): void;
};

type StageNode = Node<StageNodeData, "stage">;
type SectionNode = Node<
  {
    name: string;
    shown: boolean;
    selected: boolean;
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

function StageCard({ data }: NodeProps<StageNode>) {
  const stage = stages[data.stage];
  const status = stageStatus(data.stage, data.hasWorkflow, data.plan, data.build);
  return (
    <div className="workflow-node" data-selected={data.selected} data-stage={data.stage}>
      <Handle type="target" position={Position.Left} />
      <button
        className="workflow-node-main nopan"
        type="button"
        aria-pressed={data.selected}
        aria-label={`Inspect ${stage.title}`}
        onClick={data.select}
      >
        <span className="workflow-node-title">
          <Icon name={stage.icon} size="s" decorative />
          {stage.title}
        </span>
        <span className="workflow-node-description">{stage.description}</span>
      </button>
      <div className="workflow-node-footer">
        <span className="workflow-status" data-kind={status.kind}>
          <Icon name={status.icon} size="xs" decorative />
          {status.label}
        </span>
        <button
          className="graph-icon-button nopan"
          type="button"
          aria-label={`${data.expanded ? "Collapse" : "Expand"} ${stage.title}`}
          aria-expanded={data.expanded}
          onClick={data.toggle}
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
      data-shown={data.shown}
      aria-hidden={!data.shown}
      inert={!data.shown}
    >
      <Handle type="target" position={Position.Left} />
      <button className="nopan" type="button" aria-pressed={data.selected} onClick={data.select}>
        <Icon name="document" size="xs" decorative />
        {data.name}
      </button>
    </div>
  );
}

function BuildTaskCard({ data }: NodeProps<BuildTaskNode>) {
  const { task, shown, selected, select } = data;
  const status = buildTaskStatus[task.state];
  return (
    <div className="workflow-section" data-shown={shown} aria-hidden={!shown} inert={!shown}>
      <Handle type="target" position={Position.Top} />
      <button
        className="nopan"
        type="button"
        aria-label={`Inspect task ${task.id}: ${task.title}`}
        aria-pressed={selected}
        onClick={select}
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

const nodeTypes = { stage: StageCard, section: SectionCard, buildTask: BuildTaskCard };
type GraphNode = StageNode | SectionNode | BuildTaskNode;
type Props = {
  selection: Selection;
  hasWorkflow: boolean;
  plan?: WorkflowPlan | undefined;
  build?: WorkflowBuild;
  onSelect(selection: Selection): void;
};

export function WorkflowGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ selection, hasWorkflow, plan, build, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Partial<Record<Stage, boolean>>>({});
  const [focus, setFocus] = useState<Stage | null>(null);
  const overview = useRef<Viewport | null>(null);
  const flow = useReactFlow<GraphNode>();
  const tasks = build?.tasks ?? [];

  function isExpanded(stage: Stage) {
    return expanded[stage] ?? (stage === "build" && tasks.length > 0);
  }

  function sectionIds(stage: Stage) {
    return stage === "build" && tasks.length
      ? tasks.map(({ id }) => `build:task-${id}`)
      : Object.keys(stages[stage].sections).map((section) => `${stage}:${section}`);
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
      const visibleNodes = isExpanded(stage) ? [stage, ...sectionIds(stage)] : [stage];
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
  for (const [index, stage] of stageOrder.entries()) {
    const x = index * 256;
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
        selected: selection.stage === stage && !selection.section && !selection.taskId,
        hasWorkflow,
        plan,
        build,
        select: () => onSelect({ stage }),
        toggle: () => toggle(stage),
      },
    });

    const nextStage = stageOrder[index + 1];
    if (nextStage && !focus) {
      edges.push({
        id: `${stage}-${nextStage}`,
        source: stage,
        target: nextStage,
        type: "straight",
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--graph-link)" },
        className: "workflow-stage-link",
      });
    }
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
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--graph-link)" },
          className: expanded ? "workflow-section-link" : "workflow-section-link is-collapsed",
        });
      }
      continue;
    }
    for (const [row, [section, name]] of Object.entries(stages[stage].sections).entries()) {
      const id = `${stage}:${section}`;
      nodes.push({
        id,
        type: "section",
        position: { x: x + 26, y: 166 + row * 47 },
        width: 174,
        height: 36,
        hidden: !shown,
        data: {
          name,
          shown: Boolean(expanded[stage]),
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
        className: expanded[stage] ? "workflow-section-link" : "workflow-section-link is-collapsed",
      });
    }
  }

  const visibleNodes = nodes.filter(
    (node) => !node.hidden && (node.type === "stage" || node.data.shown),
  );
  const fitViewOptions = {
    nodes: visibleNodes.map(({ id }) => ({ id })),
    padding: 0.19,
    maxZoom: 1.08,
  };

  return (
    <section className="workflow-canvas" aria-label="Workflow canvas" data-workflow-canvas>
      <div className="canvas-toolbar" role="group" aria-label="Focus workflow stage">
        {([null, ...stageOrder] as const).map((stage) => (
          <Button
            key={stage ?? "overview"}
            type="button"
            variant="ghost"
            size="s"
            className={focus === stage ? "view-tab is-selected" : "view-tab"}
            aria-pressed={focus === stage}
            onClick={() => changeFocus(stage)}
          >
            {stage ? stages[stage].title : "Overview"}
          </Button>
        ))}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
      </ReactFlow>
    </section>
  );
}
