// FILE: src/components/ui/curved-loop.tsx
"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/utils";

interface CurvedLoopProps {
  marqueeText?: string;
  speed?: number;
  className?: string;
  curveAmount?: number;
  direction?: "left" | "right";
  interactive?: boolean;
}

function wrapOffset(offset: number, spacing: number) {
  if (offset <= -spacing) {
    return offset + spacing;
  }

  if (offset > 0) {
    return offset - spacing;
  }

  return offset;
}

export function CurvedLoop({
  marqueeText = "",
  speed = 2,
  className,
  curveAmount = 240,
  direction = "left",
  interactive = true,
}: CurvedLoopProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedText = `${marqueeText.trimEnd()}\u00A0`;
  const measureRef = useRef<SVGTextElement | null>(null);
  const textPathRef = useRef<SVGTextPathElement | null>(null);
  const dragRef = useRef(false);
  const lastXRef = useRef(0);
  const dirRef = useRef<"left" | "right">(direction);
  const velocityRef = useRef(0);
  const [spacing, setSpacing] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pathId = `curve-${useId()}`;
  const pathD = `M-120,130 Q720,${130 + curveAmount} 1560,130`;

  useEffect(() => {
    dirRef.current = direction;
  }, [direction]);

  useEffect(() => {
    function updateSpacing() {
      if (!measureRef.current) {
        return;
      }

      setSpacing(measureRef.current.getComputedTextLength());
    }

    const frame = requestAnimationFrame(updateSpacing);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && containerRef.current
        ? new ResizeObserver(() => updateSpacing())
        : null;

    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", updateSpacing);
    }

    if (typeof document !== "undefined" && "fonts" in document) {
      void (document as Document & { fonts: FontFaceSet }).fonts.ready.then(() => {
        updateSpacing();
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", updateSpacing);
      }
    };
  }, [normalizedText, className]);

  useEffect(() => {
    if (!spacing || !textPathRef.current) {
      return;
    }

    textPathRef.current.setAttribute("startOffset", `${-spacing}px`);
  }, [spacing]);

  useEffect(() => {
    if (!spacing || !textPathRef.current) {
      return;
    }

    let frame = 0;

    const tick = () => {
      if (!dragRef.current && textPathRef.current) {
        const currentOffset = Number.parseFloat(
          textPathRef.current.getAttribute("startOffset") ?? "0",
        );
        const delta = dirRef.current === "right" ? speed : -speed;
        const nextOffset = wrapOffset(currentOffset + delta, spacing);

        textPathRef.current.setAttribute("startOffset", `${nextOffset}px`);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [spacing, speed]);

  const repeatedText = spacing
    ? Array.from({ length: Math.ceil(1800 / spacing) + 2 }, () => normalizedText).join("")
    : normalizedText;

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!interactive) {
      return;
    }

    dragRef.current = true;
    setIsDragging(true);
    lastXRef.current = event.clientX;
    velocityRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!interactive || !dragRef.current || !textPathRef.current || !spacing) {
      return;
    }

    const deltaX = event.clientX - lastXRef.current;
    lastXRef.current = event.clientX;
    velocityRef.current = deltaX;

    const currentOffset = Number.parseFloat(
      textPathRef.current.getAttribute("startOffset") ?? "0",
    );
    const nextOffset = wrapOffset(currentOffset + deltaX, spacing);

    textPathRef.current.setAttribute("startOffset", `${nextOffset}px`);
  }

  function handlePointerEnd() {
    if (!interactive) {
      return;
    }

    dragRef.current = false;
    setIsDragging(false);
    dirRef.current = velocityRef.current > 0 ? "right" : "left";
  }

  return (
    <div
      aria-hidden="true"
      ref={containerRef}
      className={cn(
        "h-full w-full",
        interactive ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "pointer-events-none",
      )}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? handlePointerEnd : undefined}
      onPointerLeave={interactive ? handlePointerEnd : undefined}
    >
      <svg
        className="block h-full w-full overflow-visible select-none"
        viewBox="0 0 1440 260"
        preserveAspectRatio="xMidYMid slice"
      >
        <text
          ref={measureRef}
          xmlSpace="preserve"
          className={cn("font-kicker text-[78px] uppercase", className)}
          style={{ opacity: 0, visibility: "hidden", pointerEvents: "none" }}
        >
          {normalizedText}
        </text>

        <defs>
          <path id={pathId} d={pathD} fill="none" stroke="transparent" />
        </defs>

        {spacing ? (
          <text
            xmlSpace="preserve"
            className={cn("font-kicker text-[78px] uppercase", className)}
          >
            <textPath ref={textPathRef} href={`#${pathId}`} startOffset={`${-spacing}px`}>
              {repeatedText}
            </textPath>
          </text>
        ) : null}
      </svg>
    </div>
  );
}
