import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl font-medium transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/40 active:translate-y-px",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-border/80 bg-card hover:bg-muted text-foreground",
        ghost: "hover:bg-muted/70 text-foreground",
        destructive: "bg-destructive/15 text-destructive hover:bg-destructive/25",
        accent: "bg-indigo-600 text-white hover:bg-indigo-500 shadow-xs",
      },
      size: {
        default: "h-8 px-3 text-xs gap-1.5",
        xs: "h-6 px-2 text-[11px] gap-1",
        sm: "h-7 px-2.5 text-xs gap-1",
        lg: "h-9 px-4 text-sm gap-2",
        icon: "size-8",
        "icon-sm": "size-7",
        "icon-xs": "size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
