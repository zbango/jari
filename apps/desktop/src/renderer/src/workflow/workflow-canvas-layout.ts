import type { XYPosition } from "@xyflow/react";
import { canvasStyles } from "./workflow-canvas-style";
import type { CanvasStyle } from "./workflow-canvas-style";

export interface CanvasNodeLayout {
  position?: XYPosition;
  width?: number;
  height?: number;
}

export type CanvasLayouts = Partial<Record<CanvasStyle, Record<string, CanvasNodeLayout>>>;

function key(workflowId: string) {
  return `agent-desktop.canvas-layout.${workflowId}`;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readCanvasLayouts(workflowId: string): CanvasLayouts {
  try {
    const saved = object(JSON.parse(localStorage.getItem(key(workflowId)) ?? "{}"));
    return Object.fromEntries(
      canvasStyles.map(({ value }) => [
        value,
        Object.fromEntries(
          Object.entries(object(saved[value])).flatMap(([id, entry]) => {
            const { position, width, height } = object(entry);
            const x = number(object(position).x);
            const y = number(object(position).y);
            const w = number(width);
            const h = number(height);
            const node: CanvasNodeLayout = {
              ...(x !== undefined && y !== undefined ? { position: { x, y } } : {}),
              ...(w !== undefined && w > 0 ? { width: w } : {}),
              ...(h !== undefined && h > 0 ? { height: h } : {}),
            };
            return Object.keys(node).length ? [[id, node]] : [];
          }),
        ),
      ]),
    );
  } catch {
    return {};
  }
}

export function saveCanvasLayouts(workflowId: string, layouts: CanvasLayouts) {
  try {
    localStorage.setItem(key(workflowId), JSON.stringify(layouts));
  } catch {
    // The layout remains available while the canvas is open.
  }
}
