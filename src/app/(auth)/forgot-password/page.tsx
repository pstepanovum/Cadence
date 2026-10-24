// FILE: src/app/(auth)/forgot-password/page.tsx
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Get a link to choose a new Cadence password.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
