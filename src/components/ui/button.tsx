// FILE: src/components/ui/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "default" | "icon";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-hunter-green text-white hover:bg-[#44784f] [&_*]:text-inherit",
  secondary:
    "bg-yellow-green text-hunter-green hover:bg-[#b5d567] [&_*]:text-inherit",
  ghost:
    "bg-vanilla-cream text-hunter-green hover:bg-[#eadfbe] [&_*]:text-inherit",
  danger:
    "bg-blushed-brick text-white hover:bg-[#a84042] [&_*]:text-inherit",
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "min-h-12 px-5 py-3.5 text-sm",
  icon: "h-14 w-14 p-0",
};

export function buttonVariants({
  variant = "primary",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full text-center font-semibold whitespace-nowrap [&>svg]:order-last [&>svg]:shrink-0 disabled:cursor-not-allowed disabled:opacity-60",
    variantStyles[variant],
    sizeStyles[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
