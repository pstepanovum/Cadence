// FILE: src/components/auth/AuthForm.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isLogin = mode === "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
          "Add your Supabase URL and publishable key in .env.local before testing authentication.",
        );
      }

      const supabase = createSupabaseBrowserClient();

      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          throw authError;
        }

        setMessage("Login successful. Taking you to the dashboard.");
        startTransition(() => {
          router.replace("/dashboard");
          router.refresh();
        });
        return;
      }

      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window === "undefined"
              ? undefined
              : `${window.location.origin}/auth/confirm?next=/checkout`,
        },
      });

      if (authError) {
        throw authError;
      }

      setMessage(
        "Account created. Check your inbox for the Supabase confirmation email, then sign in.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Something went wrong during authentication.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-xl bg-transparent p-0 backdrop-blur-0">
      <div className="space-y-8">
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
            <CardTitle className="text-3xl">
              {isLogin ? "Sign in to Cadence" : "Start your pronunciation profile"}
            </CardTitle>
            <CardDescription className="text-base">
              {isLogin
                ? "Return to your saved rounds and next coaching cue."
                : "Create your learner account and begin tracking progress."}
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

          <label className="block space-y-2">
            <span className="text-sm font-medium text-hunter-green">Password</span>
            <Input
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="At least 6 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
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
            {isSubmitting
              ? isLogin
                ? "Signing in..."
                : "Creating account..."
              : isLogin
                ? "Sign in"
                : "Create account"}
          </Button>

          {isLogin ? (
            <div className="pt-1 text-right">
              <Link href="/forgot-password" className="text-sm font-semibold text-sage-green">
                Forgot password?
              </Link>
            </div>
          ) : null}
        </form>

        <p className="px-5 text-sm leading-7 text-iron-grey sm:px-6">
          {isLogin ? "Need an account?" : "Already have an account?"}{" "}
          <Link
            href={isLogin ? "/signup" : "/login"}
            className="font-semibold text-sage-green"
          >
            {isLogin ? "Create one here." : "Sign in here."}
          </Link>
        </p>
      </div>
    </Card>
  );
}
