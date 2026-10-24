// FILE: src/app/(auth)/layout.tsx
//
// Account screens: sign in, sign up, password reset, email confirmation. They
// match the mobile app's: one centred column on a neutral page, the logo
// above a single white card, and the "switch screen" line under the card. The
// page scrolls, so a long form never clips at 375 px.
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center auth-page px-4 py-10 sm:px-6">
      {children}
    </main>
  );
}
