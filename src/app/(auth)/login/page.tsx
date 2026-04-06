// FILE: src/app/(auth)/login/page.tsx
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your Cadence account and continue your pronunciation practice.",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const runtime = await getRequestRuntime();
  return <AuthForm mode="login" runtime={runtime} />;
}
