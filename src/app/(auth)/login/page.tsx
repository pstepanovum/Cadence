// FILE: src/app/(auth)/login/page.tsx
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Cadence and pick up where you left off.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
