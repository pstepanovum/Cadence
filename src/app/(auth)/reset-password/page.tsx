// FILE: src/app/(auth)/reset-password/page.tsx
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your Cadence account.",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  const runtime = await getRequestRuntime();
  return <ResetPasswordForm runtime={runtime} />;
}
