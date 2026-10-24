// FILE: src/components/theme/ThemeToggle.tsx
"use client";

import { useSyncExternalStore } from "react";
import { nextThemeChoice, parseThemeChoice, THEME_COOKIE, type ThemeChoice } from "@/components/theme/theme";
import { cn } from "@/lib/utils";

const LABELS: Record<ThemeChoice, string> = {
  system: "Theme: system",
  light: "Theme: light",
  dark: "Theme: dark",
};

const THEME_EVENT = "cadence:theme";

function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

function readChoice(): ThemeChoice {
  const attr = document.documentElement.getAttribute("data-theme");
  return parseThemeChoice(attr);
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
    document.cookie = `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  } else {
    root.setAttribute("data-theme", choice);
    document.cookie = `${THEME_COOKIE}=${choice}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

function Icon({ choice }: { choice: ThemeChoice }) {
  if (choice === "dark") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
      </svg>
    );
  }
  if (choice === "light") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" />
    </svg>
  );
}

/** Cycles system, light, dark. Shows the current choice. */
export function ThemeToggle({ className, tone = "default" }: { className?: string; tone?: "default" | "onDark" }) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

  function cycle() {
    apply(nextThemeChoice(choice));
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${LABELS[choice]}. Change theme`}
      title={LABELS[choice]}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors",
        tone === "onDark"
          ? "bg-white/10 text-bright-snow hover:bg-white/20"
          : "bg-vanilla-cream text-hunter-green hover:bg-platinum",
        className,
      )}
    >
      <Icon choice={choice} />
    </button>
  );
}
