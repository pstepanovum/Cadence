// FILE: src/components/ui/select.tsx
import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "griddy-icons";
import { cn } from "@/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: "default" | "white";
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, variant = "default", children, ...props }, ref) {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(
            "min-h-12 w-full cursor-pointer appearance-none rounded-full px-4 py-3 text-sm font-semibold text-hunter-green outline-none transition-colors",
            variant === "white"
              ? "bg-white hover:bg-white/90"
              : "bg-vanilla-cream hover:bg-vanilla-cream/80",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
          <ChevronDown size={16} color="currentColor" className="text-hunter-green/60" />
        </div>
      </div>
    );
  },
);
