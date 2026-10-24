// FILE: src/components/ui/privacy-choices-modal.tsx
//
// The footer's "Your Privacy Choices" link. The dialog itself is a separate
// chunk fetched on the first click, so it costs nothing on page load.
"use client";

import { useState, type ComponentType } from "react";

type Panel = ComponentType<{ onClose: () => void }>;

export function PrivacyChoicesModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [Panel, setPanel] = useState<Panel | null>(null);

  function open() {
    setIsOpen(true);
    if (!Panel) void import("@/components/ui/privacy-choices-panel").then((m) => setPanel(() => m.PrivacyChoicesPanel));
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex items-center gap-1.5 text-xs text-white/84 transition-colors hover:text-white"
      >
        <span aria-hidden="true" className="inline-block h-3 w-6 bg-[url(/icon/privacyoptions.svg)] bg-contain bg-center bg-no-repeat" />
        <span>Your Privacy Choices</span>
      </button>
      {isOpen && Panel ? <Panel onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}
