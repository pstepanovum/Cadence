// FILE: src/components/ui/sign-out-button.tsx
"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-hunter-green px-4 py-2.5 text-sm font-semibold text-white whitespace-nowrap hover:bg-[#44784f]"
    >
      Sign out
    </button>
  );
}
