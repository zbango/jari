import { Mascot, mascotDesignProps, WorkingIndicator } from "@once-ui-system/core";
import type { MascotDesign } from "@once-ui-system/core";
import { createContext, useContext } from "react";

export const mascotStorageKey = "agent-desktop.mascot-design";
export const defaultMascotDesign = { v: 1 } satisfies MascotDesign;
export const MascotDesignContext = createContext<MascotDesign>(defaultMascotDesign);

export function ProviderActivity({
  label,
  state = "thinking",
}: {
  label: string;
  state?: "thinking" | "listening";
}) {
  const design = useContext(MascotDesignContext);
  return (
    <WorkingIndicator
      label={label}
      aria-label={`Provider activity. ${label}`}
      shimmer={false}
      loader={
        <Mascot
          {...mascotDesignProps(design)}
          size={48}
          state={state}
          lookAt="center"
          poke={false}
          aria-hidden="true"
        />
      }
    />
  );
}
