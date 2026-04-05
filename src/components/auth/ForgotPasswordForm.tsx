// FILE: src/components/auth/ForgotPasswordForm.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    try {
      setIsSubmitting(true);

      if (!isSupabaseConfigured) {
        throw new Error(
          "Add your Supabase URL and publishable key in .env.local before testing password recovery.",
        );
      }

      const supabase = createSupabaseBrowserClient();
      const redirectTo =
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}/reset-password`;

      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo },
      );

      if (authError) {
        throw authError;
      }

      setMessage(
        "Recovery email sent. Open the link in your inbox to choose a new password.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to send the password reset email.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-xl bg-transparent p-0 backdrop-blur-0">
      <div className="space-y-4">
        <div className="space-y-5 px-5 sm:px-6">
          <Link href="/" className="inline-flex w-fit items-center">
            <Image
              src="/logo/logo-green-white.svg"
              alt="Cadence logo"
              width={136}
              height={30}
              className="h-[30px] w-auto object-contain"
              priority
            />
          </Link>

          <div className="space-y-3">
            <CardTitle className="text-3xl">Reset your password</CardTitle>
            <CardDescription className="text-base">
              Enter the email tied to your Cadence account and we&apos;ll send the reset link.
            </CardDescription>
          </div>
        </div>

        <form
          className="space-y-4 rounded-[2rem] bg-vanilla-cream px-5 py-5 sm:px-6 sm:py-6"
          onSubmit={handleSubmit}
        >
          <label className="block space-y-2">
            <span className="text-sm font-medium text-hunter-green">Email</span>
            <Input
              type="email"
              autoComplete="email"
              placeholder="learner@cadence.app"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="bg-white"
            />
          </label>

          {message ? (
            <div className="rounded-3xl bg-yellow-green px-4 py-3 text-sm text-hunter-green">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
              {error}
            </div>
          ) : null}

          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending recovery email..." : "Send recovery email"}
          </Button>
        </form>

        <p className="px-5 text-sm leading-7 text-iron-grey sm:px-6">
          Remembered your password?{" "}
          <Link href="/login" className="font-semibold text-sage-green">
            Return to sign in.
          </Link>
        </p>
      </div>
    </Card>
  );
}
