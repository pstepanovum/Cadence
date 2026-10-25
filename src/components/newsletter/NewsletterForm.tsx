// FILE: src/components/newsletter/NewsletterForm.tsx
"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import type { NewsletterSource } from "@/components/newsletter/newsletter-api";
import { clsx as cn } from "clsx";

interface NewsletterFormProps {
  source: Extract<NewsletterSource, "footer" | "page">;
  /** "onDark" for the green footer card. */
  tone?: "default" | "onDark";
  className?: string;
}

export function NewsletterForm({ source, tone = "default", className }: NewsletterFormProps) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const onDark = tone === "onDark";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setState("sending");
    // Loaded on submit: the form sits in every page's footer.
    const { describeSubscribeFailure, subscribeToNewsletter } = await import("@/components/newsletter/newsletter-api");
    const result = await subscribeToNewsletter(email, source);
    if (result.ok) {
      setState("sent");
      return;
    }
    setState("idle");
    setError(describeSubscribeFailure(result));
  }

  if (state === "sent") {
    return (
      <div
        role="status"
        className={cn(
          "rounded-3xl px-5 py-4",
          onDark ? "bg-white/10 text-bright-snow" : "bg-yellow-green text-hunter-green",
          className,
        )}
      >
        <p className="font-semibold">Check your email.</p>
        <p className={cn("mt-1 text-sm leading-6", onDark ? "text-bright-snow" : "text-hunter-green")}>
          We sent a link to {email.trim()}. You are on the list once you click it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("space-y-2", className)} noValidate>
      <label htmlFor={`${id}-email`} className={cn("block text-sm font-semibold", onDark ? "text-bright-snow" : "text-hunter-green")}>
        Product updates and occasional offers
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-note`}
          className={cn(
            "h-12 w-full min-w-0 flex-1 rounded-full px-4 text-sm leading-none placeholder:text-slate-grey",
            onDark ? "bg-white/90 text-[#212529] on-color" : "bg-white text-hunter-green ring-1 ring-alabaster-grey",
          )}
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className={cn(
            "h-12 shrink-0 cursor-pointer rounded-full px-5 text-sm font-semibold disabled:cursor-wait disabled:opacity-70",
            onDark ? "bg-yellow-green text-hunter-green" : "bg-hunter-green text-white",
          )}
        >
          {state === "sending" ? "Sending…" : "Sign up"}
        </button>
      </div>
      {error ? (
        <p role="alert" className={cn("text-sm", onDark ? "text-yellow-green" : "text-blushed-brick")}>
          {error}
        </p>
      ) : null}
      <p id={`${id}-note`} className={cn("text-xs leading-5", onDark ? "text-bright-snow/84" : "text-slate-grey")}>
        A few emails a month at most. Unsubscribe from any email.{" "}
        <Link href="/privacy#newsletter" className="underline underline-offset-2">
          Privacy
        </Link>
      </p>
    </form>
  );
}
