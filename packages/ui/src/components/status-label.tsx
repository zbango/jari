import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export function StatusLabel({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-medium text-foreground", className)}
      {...props}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
      {children}
    </span>
  );
}
