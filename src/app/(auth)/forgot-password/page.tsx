// FILE: src/app/(auth)/forgot-password/page.tsx
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your Cadence password and get back to your practice.",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  const runtime = await getRequestRuntime();
  return <ForgotPasswordForm runtime={runtime} />;
}
