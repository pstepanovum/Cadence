// FILE: src/components/ui/navbar.tsx
import Link from "next/link";
import { Download, Settings } from "griddy-icons";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { BrandMark } from "@/components/ui/brand-mark";
import { NavbarFrame } from "@/components/ui/navbar-frame";
import { getAppSession } from "@/lib/app-session";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";
import { cn } from "@/lib/utils";

export type NavKey =
  | "home"
  | "dashboard"
  | "practice"
  | "phrases"
  | "grammar"
  | "sounds"
  | "learn"
  | "login"
  | "signup"
  | "conversation"
  | "coach"
  | "profile"
  | "account"
  | "pricing"
  | "download";

interface NavbarProps {
  current?: NavKey;
  variant?: "default" | "dark";
}

const navBaseClass =
  "inline-flex min-h-11 items-center justify-center rounded-[14px] px-4 py-2.5 text-sm font-semibold whitespace-nowrap";

export async function Navbar({ current, variant = "default" }: NavbarProps) {
  const session = await getAppSession();
  const runtime = await getRequestRuntime();
  const isAuthenticated = Boolean(session.user);
  const logoHref = isAuthenticated ? "/dashboard" : "/";

  const navItems: { href: string; key: NavKey; label: string }[] = isAuthenticated
    ? [
        { href: "/dashboard", key: "home", label: "Home" },
        { href: "/practice", key: "practice", label: "Practice" },
        { href: "/today", key: "phrases", label: "Phrases" },
        { href: "/sounds", key: "sounds", label: "Sounds" },
        { href: "/learn", key: "learn", label: "Modules" },
        { href: "/coach", key: "coach", label: "Coach" },
      ]
    : [
        { href: "/practice", key: "practice", label: "Practice" },
        { href: "/sounds", key: "sounds", label: "Sounds" },
        { href: "/pricing", key: "pricing", label: "Pricing" },
        { href: "/login", key: "login", label: "Sign in" },
        { href: "/signup", key: "signup", label: "Sign up" },
      ];

  const isDark = variant === "dark";
  const inactiveClass = isDark
    ? "bg-white/10 text-bright-snow hover:bg-white/20"
    : "text-iron-grey hover:bg-page hover:text-carbon-black";
  const activeClass = isDark ? "bg-white text-carbon-black" : "bg-hunter-green text-white";

  return (
    <NavbarFrame variant={variant} runtime={runtime}>
      <div className="flex w-full items-center justify-between gap-3 md:w-auto">
        <Link href={logoHref} className="flex h-11 items-center" aria-label="Cadence home">
          <BrandMark variant={isDark ? "white" : "dark"} />
        </Link>
        <ThemeToggle tone={isDark ? "onDark" : "default"} className="md:hidden" />
      </div>

      <nav aria-label="Main" className="-mx-1 w-full min-w-0 overflow-x-auto px-1 md:mx-0 md:w-auto md:px-0">
        <ul className="flex flex-nowrap items-center gap-2">
          {navItems.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={current === item.key ? "page" : undefined}
                className={cn(
                  navBaseClass,
                  current === item.key
                    ? activeClass
                    : item.key === "signup"
                      ? "bg-hunter-green text-white hover:brightness-110"
                      : inactiveClass,
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}

          {!isAuthenticated ? (
            <li>
              <Link
                href="/download"
                aria-current={current === "download" ? "page" : undefined}
                className={cn(navBaseClass, "gap-1.5", current === "download" ? activeClass : inactiveClass)}
              >
                <Download size={15} color="currentColor" aria-hidden="true" />
                Download
              </Link>
            </li>
          ) : (
            <li>
              <Link
                href="/account"
                aria-label="Account and settings"
                aria-current={current === "account" || current === "profile" ? "page" : undefined}
                className={cn(
                  navBaseClass,
                  "w-11 px-0",
                  current === "account" || current === "profile" ? activeClass : inactiveClass,
                )}
              >
                <Settings size={18} color="currentColor" aria-hidden="true" />
              </Link>
            </li>
          )}
          <li className="hidden md:block">
            <ThemeToggle tone={isDark ? "onDark" : "default"} />
          </li>
        </ul>
      </nav>
    </NavbarFrame>
  );
}
