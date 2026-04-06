// FILE: src/components/ui/navbar.tsx
import Link from "next/link";
import { Download, Settings } from "griddy-icons";
import { BrandMark } from "@/components/ui/brand-mark";
import { NavbarFrame } from "@/components/ui/navbar-frame";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";
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
  | "profile"
  | "download";

interface NavbarProps {
  current?: NavKey;
  variant?: "default" | "dark";
}

const navBaseClass =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap";

export async function Navbar({ current, variant = "default" }: NavbarProps) {
  const supabase = await createSupabaseServerClient();
  const runtime = await getRequestRuntime();
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

  const isDark = variant === "dark";

  // Inactive item styles differ between default (white card) and dark (green card)
  const inactiveClass = isDark
    ? "bg-white/10 text-bright-snow hover:bg-white/20"
    : "bg-vanilla-cream text-hunter-green hover:bg-[#eadfbe]";

  const activeClass = "bg-yellow-green text-hunter-green";

  const signupCtaClass = isDark
    ? "bg-yellow-green text-hunter-green hover:bg-[#b5d567]"
    : "bg-yellow-green text-hunter-green hover:bg-[#b5d567]";

  return (
    <NavbarFrame variant={variant} runtime={runtime}>
      <Link
        href={logoHref}
        className="flex h-11 items-center justify-center self-center"
      >
        <BrandMark variant={isDark ? "white" : "dark"} />
      </Link>

      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto self-center">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              navBaseClass,
              current === item.key
                ? activeClass
                : item.key === "signup" && !isAuthenticated
                  ? signupCtaClass
                  : inactiveClass,
            )}
          >
            {item.label}
          </Link>
        ))}

        {!isAuthenticated && (
          <Link
            href="/download"
            className={cn(
              navBaseClass,
              "gap-1.5",
              current === ("download" satisfies NavKey)
                ? activeClass
                : inactiveClass,
            )}
            aria-label="Download desktop app"
          >
            <Download size={15} color="currentColor" />
            Download
          </Link>
        )}

        {isAuthenticated && (
          <Link
            href="/profile"
            className={cn(
              navBaseClass,
              "min-h-11 w-11 px-0",
              current === ("profile" satisfies NavKey)
                ? activeClass
                : inactiveClass,
            )}
            aria-label="Profile & settings"
          >
            <Settings size={18} color="currentColor" />
          </Link>
        )}
      </div>
    </NavbarFrame>
  );
}
