import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

/* The bar width is data-driven; Radix sets it via a transform, so no inline style here. */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const percent = Math.round(Math.max(0, Math.min(100, value ?? 0)));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", className)}
      value={percent}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all [translate:calc(var(--progress-remaining)*-1%)_0]"
        ref={(el) => {
          el?.style.setProperty("--progress-remaining", String(100 - percent));
        }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
