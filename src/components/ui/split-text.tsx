// FILE: src/components/ui/split-text.tsx
"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
} from "react";
import { cn } from "@/lib/utils";

interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  tag?: "h1" | "h2" | "h3" | "p" | "span";
  textAlign?: CSSProperties["textAlign"];
}

export function SplitText({
  text,
  className,
  delay = 36,
  duration = 700,
  tag = "p",
  textAlign = "left",
}: SplitTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.18,
        rootMargin: "-40px",
      },
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  const Tag = tag as ElementType;

  return (
    <Tag
      ref={ref}
      className={cn("overflow-hidden whitespace-normal", className)}
      style={{ textAlign }}
    >
      {text.split("").map((character, index) => {
        const isSpace = character === " ";

        return (
          <span
            key={`${character}-${index}`}
            aria-hidden="true"
            className="inline-block will-change-transform will-change-opacity"
            style={{
              transitionProperty: "transform, opacity",
              transitionDuration: `${duration}ms`,
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              transitionDelay: `${index * delay}ms`,
              transform: visible ? "translateY(0px)" : "translateY(24px)",
              opacity: visible ? 1 : 0,
              whiteSpace: isSpace ? "pre" : "normal",
            }}
          >
            {isSpace ? "\u00A0" : character}
          </span>
        );
      })}
      <span className="sr-only">{text}</span>
    </Tag>
  );
}
