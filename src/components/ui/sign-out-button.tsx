// FILE: src/components/ui/sign-out-button.tsx
"use client";

import { useRouter } from "next/navigation";
import type { AppMode } from "@/lib/app-mode";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function SignOutButton({ mode }: { mode: AppMode }) {
  const router = useRouter();

  async function handleSignOut() {
    if (mode === "local") {
      await fetch("/api/setup/mode", {
        method: "DELETE",
      }).catch(() => {});
      router.replace("/setup");
      router.refresh();
      return;
    }

    await signOut(getFirebaseAuth()).catch(() => {});
    await Promise.all([
      fetch("/api/auth/session", { method: "DELETE" }).catch(() => {}),
      fetch("/api/setup/mode", { method: "DELETE" }).catch(() => {}),
    ]);
    router.replace("/setup");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[14px] bg-hunter-green px-4 py-2.5 text-sm font-semibold text-white whitespace-nowrap hover:bg-[#44784f]"
    >
      {mode === "local" ? "Exit local mode" : "Sign out"}
    </button>
  );
}
