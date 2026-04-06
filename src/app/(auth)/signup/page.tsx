// FILE: src/app/(auth)/signup/page.tsx
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";

export const metadata: Metadata = {
  title: "Create an Account",
  description: "Sign up for Cadence and start building a real pronunciation practice habit.",
  robots: { index: false, follow: false },
};

export default async function SignupPage() {
  const runtime = await getRequestRuntime();
  return <AuthForm mode="signup" runtime={runtime} />;
}
