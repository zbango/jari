export const canvasStyles = [
  { value: "map", label: "Map", prefixIcon: "grid" },
  { value: "timeline", label: "Timeline", prefixIcon: "time" },
  { value: "compact", label: "Compact", prefixIcon: "layers" },
] as const;

export type CanvasStyle = (typeof canvasStyles)[number]["value"];

export const canvasGeometry = {
  map: {
    cardWidth: 200,
    cardHeight: 122,
    pathGap: 56,
    detailWidth: 174,
    detailHeight: 36,
    detailStep: 47,
    taskHeight: 58,
    taskStep: 76,
    branchOffset: 44,
  },
  timeline: {
    cardWidth: 220,
    cardHeight: 112,
    pathGap: 40,
    detailWidth: 190,
    detailHeight: 34,
    detailStep: 42,
    taskHeight: 52,
    taskStep: 64,
    branchOffset: 8,
  },
  compact: {
    cardWidth: 170,
    cardHeight: 82,
    pathGap: 36,
    detailWidth: 150,
    detailHeight: 32,
    detailStep: 40,
    taskHeight: 50,
    taskStep: 62,
    branchOffset: 35,
  },
} satisfies Record<CanvasStyle, Record<string, number>>;

export const canvasStyleStorageKey = "agent-desktop.canvas-style";

export function readCanvasStyle(): CanvasStyle {
  try {
    const stored = localStorage.getItem(canvasStyleStorageKey);
    return canvasStyles.find(({ value }) => value === stored)?.value ?? "map";
  } catch {
    return "map";
  }
}
