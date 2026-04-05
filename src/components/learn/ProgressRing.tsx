// FILE: src/components/learn/ProgressRing.tsx
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  valueLabel?: string;
  trackColor?: string;
}

export function ProgressRing({
  score,
  size = 72,
  strokeWidth = 6,
  className,
  valueLabel,
  trackColor = "#dee2e6",
}: ProgressRingProps) {
  const safeScore = Math.max(0, Math.min(score, 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeScore / 100) * circumference;
  const displayValue = valueLabel ?? `${safeScore}`;
  const strokeColor =
    safeScore >= 70 ? "#a7c957" : safeScore >= 50 ? "#6a994e" : "#bc4749";
  const fontSize = displayValue.length >= 4 ? size * 0.18 : size * 0.24;

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={`Score: ${safeScore} out of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        className="pointer-events-none absolute font-semibold leading-none text-hunter-green"
        style={{ fontSize }}
      >
        {displayValue}
      </span>
    </div>
  );
}
