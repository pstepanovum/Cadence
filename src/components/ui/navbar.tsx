// FILE: src/components/ui/navbar.tsx
import Link from "next/link";
import { Settings } from "griddy-icons";
import { BrandMark } from "@/components/ui/brand-mark";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type NavKey =
  | "home"
  | "dashboard"
  | "learn"
  | "login"
  | "signup"
  | "conversation"
  | "coach"
  | "profile";

interface NavbarProps {
  current?: NavKey;
}

const navBaseClass =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap";

export async function Navbar({ current }: NavbarProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(user);
  const logoHref = isAuthenticated ? "/dashboard" : "/";

  const navItems = isAuthenticated
    ? [
        {
          href: "/dashboard",
          key: "home" as const,
          label: "Home",
          locked: false,
        },
        {
          href: "/learn",
          key: "learn" as const,
          label: "Modules",
          locked: false,
        },
        {
          href: "/conversation",
          key: "conversation" as const,
          label: "Conversation",
          locked: false,
        },
        {
          href: "/coach",
          key: "coach" as const,
          label: "AI Coach",
          locked: false,
        },
      ]
    : [
        {
          href: "/login",
          key: "login" as const,
          label: "Login",
          locked: false,
        },
        {
          href: "/signup",
          key: "signup" as const,
          label: "Sign up",
          locked: false,
        },
      ];

  return (
    <header className="rounded-3xl bg-white px-5 py-4 text-hunter-green">
      <div className="flex flex-wrap items-center justify-between gap-4 md:flex-nowrap">
        <Link
          href={logoHref}
          className="flex h-11 items-center justify-center self-center"
        >
          <BrandMark />
        </Link>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto self-center">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                navBaseClass,
                current === item.key
                  ? "bg-yellow-green text-hunter-green"
                  : item.key === "signup" && !isAuthenticated
                    ? "bg-yellow-green text-hunter-green hover:bg-[#b5d567]"
                    : "bg-vanilla-cream text-hunter-green hover:bg-[#eadfbe]",
              )}
            >
              {item.label}
            </Link>
          ))}

          {isAuthenticated && (
            <Link
              href="/profile"
              className={cn(
                navBaseClass,
                "min-h-11 w-11 px-0",
                current === ("profile" satisfies NavKey)
                  ? "bg-yellow-green text-hunter-green"
                  : "bg-vanilla-cream text-hunter-green hover:bg-[#eadfbe]",
              )}
              aria-label="Profile & settings"
            >
              <Settings size={18} color="currentColor" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
