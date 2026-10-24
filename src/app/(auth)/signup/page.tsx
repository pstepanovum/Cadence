// FILE: src/app/(auth)/signup/page.tsx
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a free Cadence account; your streak and stats follow you to every device.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
