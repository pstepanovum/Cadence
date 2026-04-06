// FILE: src/components/auth/ResetPasswordForm.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { AppRuntime } from "@/lib/runtime/request-runtime";
import { cn } from "@/lib/utils";

export function ResetPasswordForm({ runtime }: { runtime: AppRuntime }) {
  const router = useRouter();
  const isDesktop = runtime === "desktop";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const supabase = createSupabaseBrowserClient();

    void supabase.auth.getSession().then(() => {
      setReady(true);
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setIsSubmitting(true);

      if (!isSupabaseConfigured) {
        throw new Error(
          "Add your Supabase URL and publishable key in .env.local before testing password recovery.",
        );
      }

      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.updateUser({
        password,
      });

      if (authError) {
        throw authError;
      }

      setMessage("Password updated. Taking you back to sign in.");

      startTransition(() => {
        window.setTimeout(() => {
          router.replace("/login");
        }, 900);
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to update your password.",
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
                Choose a new password
              </CardTitle>
              <CardDescription className="text-base">
                Set a fresh password for your Cadence account and return to practice.
              </CardDescription>
            </div>
          </div>

          <form
            className="space-y-4 px-5 py-1 sm:px-6"
            onSubmit={handleSubmit}
          >
            <label className="block">
              <span className="block pb-2 text-sm font-medium text-hunter-green">New password</span>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="bg-white"
              />
            </label>

            <label className="block">
              <span className="block pb-2 text-sm font-medium text-hunter-green">Confirm password</span>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
                className="bg-white"
              />
            </label>

            {!ready ? (
              <div className="rounded-3xl bg-white px-4 py-3 text-sm text-iron-grey">
                Loading recovery session...
              </div>
            ) : null}

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

            <Button className="w-full" type="submit" disabled={isSubmitting || !ready}>
              {isSubmitting ? "Updating password..." : "Update password"}
            </Button>
          </form>

          <p className="px-5 text-sm leading-7 text-iron-grey sm:px-6">
            Need a fresh email link?{" "}
            <Link href="/forgot-password" className="font-semibold text-sage-green">
              Request another recovery email.
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
              Choose a new password
            </CardTitle>
            <CardDescription className="text-base">
              Set a fresh password for your Cadence account and return to practice.
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
            <span className="block pb-2 text-sm font-medium text-hunter-green">New password</span>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="bg-white"
            />
          </label>

          <label className="block">
            <span className="block pb-2 text-sm font-medium text-hunter-green">Confirm password</span>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={6}
              className="bg-white"
            />
          </label>

          {!ready ? (
            <div className="rounded-3xl bg-white px-4 py-3 text-sm text-iron-grey">
              Loading recovery session...
            </div>
          ) : null}

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

          <Button className="w-full" type="submit" disabled={isSubmitting || !ready}>
            {isSubmitting ? "Updating password..." : "Update password"}
          </Button>
        </form>

        <p className="px-5 text-sm leading-7 text-iron-grey sm:px-6">
          Need a fresh email link?{" "}
          <Link href="/forgot-password" className="font-semibold text-sage-green">
            Request another recovery email.
          </Link>
        </p>
      </div>
    </Card>
  );
}
