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

export function ResetPasswordForm() {
  const router = useRouter();
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
            <CardTitle className="text-3xl">Choose a new password</CardTitle>
            <CardDescription className="text-base">
              Set a fresh password for your Cadence account and return to practice.
            </CardDescription>
          </div>
        </div>

        <form
          className="space-y-4 rounded-[2rem] bg-vanilla-cream px-5 py-5 sm:px-6 sm:py-6"
          onSubmit={handleSubmit}
        >
          <label className="block space-y-2">
            <span className="text-sm font-medium text-hunter-green">New password</span>
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

          <label className="block space-y-2">
            <span className="text-sm font-medium text-hunter-green">Confirm password</span>
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
