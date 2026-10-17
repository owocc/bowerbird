import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors select-none",
  {
    variants: {
      variant: {
        default: "bg-primary/15 text-primary border border-primary/25",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border/80 text-foreground",
        destructive: "bg-destructive/15 text-destructive border border-destructive/25",
        success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
        indigo: "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
