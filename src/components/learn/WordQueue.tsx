// FILE: src/components/learn/WordQueue.tsx
import { cn } from "@/lib/utils";

interface WordQueueProps {
  total: number;
  current: number;
  className?: string;
}

export function WordQueue({ total, current, className }: WordQueueProps) {
  return (
    <div
      className={cn("flex w-full items-center gap-3", className)}
      aria-label="Progress through words"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        {Array.from({ length: total }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-2.5 flex-1 rounded-full",
              index < current
                ? "bg-yellow-green"
                : index === current
                  ? "bg-hunter-green"
                  : "bg-platinum",
            )}
          />
        ))}
      </div>
      <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-hunter-green">
        {current + 1}/{total}
      </span>
    </div>
  );
}
