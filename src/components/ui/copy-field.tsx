// FILE: src/components/ui/copy-field.tsx
"use client";

import { useState } from "react";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <code aria-label={label} className="min-w-0 flex-1 overflow-x-auto rounded-2xl bg-vanilla-cream px-4 py-3 font-mono text-sm whitespace-nowrap text-hunter-green">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          });
        }}
        className="min-h-11 shrink-0 cursor-pointer rounded-full bg-hunter-green px-5 text-sm font-semibold text-white"
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
