import { StatusIndicator } from "@once-ui-system/core/components/StatusIndicator";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export function StatusLabel({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("inline-flex items-center gap-2 font-medium text-foreground", className)}
      {...props}
    >
      <StatusIndicator aria-hidden="true" size="m" tone="success" />
      {children}
    </div>
  );
}
