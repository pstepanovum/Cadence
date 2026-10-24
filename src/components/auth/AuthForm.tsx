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
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { safeNextPath } from "@/lib/auth/safe-next";
import { describeAuthError } from "@/lib/firebase/auth-errors";
import { getFirebaseAuth, startServerSession } from "@/lib/firebase/client";
import type { AppRuntime } from "@/lib/runtime/request-runtime";
import { cn } from "@/lib/utils";

interface AuthFormProps {
  mode: "login" | "signup";
  runtime: AppRuntime;
}

export function AuthForm({ mode, runtime }: AuthFormProps) {
  const router = useRouter();
  const isLogin = mode === "login";
  const isDesktop = runtime === "desktop";
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

      const auth = getFirebaseAuth();

      if (isLogin) {
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        await startServerSession(user);

        setMessage("Signed in. Taking you to your dashboard.");
        startTransition(() => {
          router.replace(nextPathFromLocation() ?? "/dashboard");
          router.refresh();
        });
        return;
      }

      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await startServerSession(user);
      // Verification is offered, not required: the account works right away.
      void sendEmailVerification(user).catch(() => {});

      setMessage("Account created. Setting up your trial.");
      startTransition(() => {
        router.replace("/checkout");
        router.refresh();
      });
    } catch (nextError) {
      setError(describeAuthError(nextError, "Something went wrong during sign-in."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isDesktop) {
    return (
      <Card className="w-full max-w-[30rem] bg-transparent p-0 backdrop-blur-0">
        <div className="space-y-6">
          <div className="space-y-4 px-5 sm:px-6">
            <Link href="/" className="inline-flex w-fit items-center" aria-label="Go to home">
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
              <CardTitle className="text-[2rem] leading-tight sm:text-[2.15rem]">
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

            <label className="block">
              <span className="block pb-2 text-sm font-medium text-hunter-green">Password</span>
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

          <label className="block">
            <span className="block pb-2 text-sm font-medium text-hunter-green">Password</span>
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

/** The `?next=` path the proxy sent us here with, when it is one of ours. */
function nextPathFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}
