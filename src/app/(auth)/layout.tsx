// FILE: src/app/(auth)/layout.tsx
//
// Account screens: sign in, sign up, password reset, email confirmation. They
// match the mobile app's: one centred column on a neutral page, the logo
// and heading above the form, and the "switch screen" line under it, with no
// card. Each fits one screen at 375 px; the page scrolls only at large text.
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center auth-page px-4 py-6 sm:px-6">
      {children}
    </main>
  );
}
