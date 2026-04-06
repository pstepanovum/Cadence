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
import type { AppRuntime } from "@/lib/runtime/request-runtime";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm({ runtime }: { runtime: AppRuntime }) {
  const isDesktop = runtime === "desktop";
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

  if (!isDesktop) {
    return (
      <Card className="w-full max-w-[30rem] bg-transparent p-0 backdrop-blur-0">
        <div className="space-y-6">
          <div className="space-y-4 px-5 sm:px-6">
            <div className="inline-flex w-fit items-center">
              <Image
                src="/logo/logo-green-white.svg"
                alt="Cadence logo"
                width={136}
                height={30}
                className="h-[30px] w-auto object-contain"
                priority
              />
            </div>

            <div className="space-y-3">
              <CardTitle className="text-[2rem] leading-tight sm:text-[2.15rem]">
                Reset your password
              </CardTitle>
              <CardDescription className="text-base">
                Enter the email tied to your Cadence account and we&apos;ll send the reset link.
              </CardDescription>
            </div>
          </div>

          <form
            className="space-y-4 px-5 py-1 sm:px-6"
            onSubmit={handleSubmit}
          >
            <label className="block">
              <span className="block pb-2 text-sm font-medium text-hunter-green">Email</span>
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

  return (
    <Card
      className={cn(
        "w-full max-w-[32rem] p-0 backdrop-blur-0",
        isDesktop
          ? "bg-transparent shadow-none"
          : "bg-transparent shadow-none",
      )}
    >
      <div className="space-y-6">
        <div className="space-y-4 px-5 sm:px-6">
          <div className="inline-flex w-fit items-center">
            <Image
              src="/logo/logo-green-white.svg"
              alt="Cadence logo"
              width={136}
              height={30}
              className="h-[30px] w-auto object-contain"
              priority
            />
          </div>

          <div className="space-y-3">
            <CardTitle className="text-[2rem] leading-tight sm:text-[2.15rem]">
              Reset your password
            </CardTitle>
            <CardDescription className="text-base">
              Enter the email tied to your Cadence account and we&apos;ll send the reset link.
            </CardDescription>
          </div>
        </div>

        <form
          className={cn(
            "space-y-4 px-5 py-1 sm:px-6",
            isDesktop
              ? ""
              : "border border-[#e6d9bd] bg-white px-6 py-6 shadow-[0_20px_64px_rgba(41,66,45,0.08)] sm:px-7 sm:py-7 lg:px-8",
          )}
          onSubmit={handleSubmit}
        >
          <label className="block">
            <span className="block pb-2 text-sm font-medium text-hunter-green">Email</span>
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
