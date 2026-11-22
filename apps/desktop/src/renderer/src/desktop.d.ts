import type { DesktopInfo, WorkflowApi } from "@agent-desktop/shared";

declare global {
  interface Window {
    readonly desktop: DesktopInfo;
    readonly workflows: WorkflowApi;
  }
}
