// FILE: src/app/(auth)/login/page.tsx
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your Cadence account and continue your pronunciation practice.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
