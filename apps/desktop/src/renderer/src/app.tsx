import type { DesktopInfo } from "@agent-desktop/shared";
import { StatusLabel } from "@agent-desktop/ui/components/status-label";
import icon from "../../../resources/icon.png?url";

export function App({ desktop }: { desktop: DesktopInfo }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-5 text-foreground sm:p-10">
      <section className="w-full max-w-sm rounded-xl border border-border bg-card p-6 sm:p-8">
        <img src={icon} width="56" height="56" alt="" className="mb-5" />
        <h1 className="text-2xl font-semibold tracking-tight">{desktop.name}</h1>
        <div className="mt-5 space-y-1 border-t border-border pt-4 text-sm">
          <StatusLabel data-desktop-status>Application shell is operational</StatusLabel>
          <p data-desktop-version className="text-muted-foreground">
            Version {desktop.version}
          </p>
        </div>
      </section>
    </main>
  );
}
