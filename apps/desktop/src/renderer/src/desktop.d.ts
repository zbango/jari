import type { DesktopInfo } from "@agent-desktop/shared";

declare global {
  interface Window {
    readonly desktop: DesktopInfo;
  }
}
