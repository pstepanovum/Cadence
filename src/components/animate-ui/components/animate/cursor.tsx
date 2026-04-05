// FILE: src/components/animate-ui/components/animate/cursor.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/utils";

type CursorSide = "top" | "bottom" | "left" | "right";
type CursorAlign = "start" | "center" | "end";

interface CursorContextValue {
  active: boolean;
  enabled: boolean;
  mode: "absolute" | "fixed";
  x: number;
  y: number;
}

const CursorContext = createContext<CursorContextValue | null>(null);

function useCursorContext() {
  const context = useContext(CursorContext);

  if (!context) {
    throw new Error("Cursor components must be used inside CursorProvider.");
  }

  return context;
}

function getAlignTransform(align: CursorAlign) {
  switch (align) {
    case "start":
      return "translate(0%, 0%)";
    case "end":
      return "translate(-100%, 0%)";
    default:
      return "translate(-50%, 0%)";
  }
}

export interface CursorFollowProps {
  side?: CursorSide;
  sideOffset?: number;
  align?: CursorAlign;
  alignOffset?: number;
  children: ReactNode;
  className?: string;
}

interface CursorProviderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  global?: boolean;
}

export function CursorProvider({
  children,
  className,
  global = false,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  ...props
}: CursorProviderProps) {
  const [active, setActive] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: fine)");
    const update = () => setEnabled(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  function updatePosition(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled) {
      return;
    }

    if (global) {
      setPosition({ x: event.clientX, y: event.clientY });
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    setPosition({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
  }

  const value = useMemo<CursorContextValue>(
    () => ({
      active,
      enabled,
      mode: global ? "fixed" : "absolute",
      x: position.x,
      y: position.y,
    }),
    [active, enabled, global, position.x, position.y],
  );

  return (
    <CursorContext.Provider value={value}>
      <div
        className={cn(
          "relative overflow-visible",
          enabled ? "cursor-none" : "",
          className,
        )}
        onPointerEnter={(event) => {
          setActive(true);
          updatePosition(event);
          onPointerEnter?.(event);
        }}
        onPointerMove={(event) => {
          updatePosition(event);
          onPointerMove?.(event);
        }}
        onPointerLeave={(event) => {
          setActive(false);
          onPointerLeave?.(event);
        }}
        {...props}
      >
        {children}
      </div>
    </CursorContext.Provider>
  );
}

interface CursorProps {
  className?: string;
}

export function Cursor({ className }: CursorProps) {
  const { active, enabled, mode, x, y } = useCursorContext();

  if (!enabled) {
    return null;
  }

  const style: CSSProperties = {
    left: x,
    top: y,
    transform: `translate(-50%, -50%) scale(${active ? 1 : 0.8})`,
  };

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none z-30 h-4 w-4 rounded-full opacity-0 transition-[transform,opacity] duration-150 ease-out",
        mode === "fixed" ? "fixed" : "absolute",
        active ? "opacity-100" : "opacity-0",
        className ?? "bg-hunter-green",
      )}
      style={style}
    />
  );
}

export function CursorFollow({
  side = "bottom",
  sideOffset = 14,
  align = "center",
  alignOffset = 0,
  children,
  className,
}: CursorFollowProps) {
  const { active, enabled, mode, x, y } = useCursorContext();

  if (!enabled) {
    return null;
  }

  let nextX = x;
  let nextY = y;
  let transform = getAlignTransform(align);

  switch (side) {
    case "top":
      nextY -= sideOffset;
      transform = `${transform} translateY(-100%)`;
      break;
    case "left":
      nextX -= sideOffset;
      transform = `${transform} translate(-100%, -50%)`;
      break;
    case "right":
      nextX += sideOffset;
      transform = `${transform} translateY(-50%)`;
      break;
    default:
      nextY += sideOffset;
      break;
  }

  nextX += alignOffset;

  const style: CSSProperties = {
    left: nextX,
    top: nextY,
    transform: `${transform} scale(${active ? 1 : 0.92})`,
  };

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none z-30 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold opacity-0 transition-[transform,opacity] duration-200 ease-out",
        mode === "fixed" ? "fixed" : "absolute",
        active ? "opacity-100" : "opacity-0",
        className ?? "bg-hunter-green text-white",
      )}
      style={style}
    >
      {children}
    </div>
  );
}
