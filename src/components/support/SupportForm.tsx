// FILE: src/components/support/SupportForm.tsx
//
// The contact form: POST /api/support (src/lib/server/support-http.ts). The
// same checks as the server run here first (src/lib/support-request.ts). A
// signed-in writer's ID token goes along through cloudFetch, so the request
// is tied to their account. `website` is a hidden field only bots fill.
"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/components/ui/contact";
import { SUPPORT_LIMITS, SUPPORT_TOPICS, checkSupportRequest, type SupportTopic } from "@/lib/support-request";
import { cn } from "@/lib/utils";

const field = "w-full rounded-2xl bg-platinum px-4 py-3 text-sm text-carbon-black placeholder:text-slate-grey focus-visible:outline-2 focus-visible:outline-sage-green";

export function SupportForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const id = useId();
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<{ field?: string; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const platform = typeof navigator !== "undefined" && /CadenceDesktop/.test(navigator.userAgent) ? "desktop" : "web";
    const body = { email, name, topic, message, platform, website };
    const checked = checkSupportRequest(body);
    if (!checked.ok) {
      setError({ field: checked.field, text: checked.message });
      return;
    }
    setError(null);
    setState("sending");
    try {
      const { cloudFetch } = await import("@/hooks/cloud-fetch");
      const response = await cloudFetch("/api/support", { method: "POST", json: body });
      if (response.ok) {
        setState("sent");
        return;
      }
      const payload = (await response.json().catch(() => null)) as { message?: string; field?: string } | null;
      setError({
        field: payload?.field,
        text: response.status === 503 ? `The form isn't available here. Email ${SUPPORT_EMAIL}.` : (payload?.message ?? `That didn't send. Try again, or email ${SUPPORT_EMAIL}.`),
      });
    } catch {
      setError({ text: `That didn't send. Check your connection, or email ${SUPPORT_EMAIL}.` });
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-[20px] bg-white px-6 py-6 text-carbon-black">
        <p className="text-lg font-semibold">Sent.</p>
        <p className="mt-1 text-sm leading-6 text-iron-grey">
          We reply to {email.trim()}, usually within two working days.
        </p>
      </div>
    );
  }

  const invalid = (key: string) => (error?.field === key ? true : undefined);

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset>
        <legend className="pb-2 text-sm font-semibold text-carbon-black">What is it about?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SUPPORT_TOPICS.map((choice) => {
            const chosen = topic === choice.value;
            return (
              <label
                key={choice.value}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                  chosen ? "bg-hunter-green text-white" : "bg-platinum text-carbon-black hover:bg-alabaster-grey",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-topic`}
                  value={choice.value}
                  checked={chosen}
                  onChange={() => setTopic(choice.value)}
                  className="sr-only"
                />
                {choice.label}
              </label>
            );
          })}
        </div>
        {error?.field === "topic" ? <p role="alert" className="pt-2 text-sm text-blushed-brick">{error.text}</p> : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-email`} className="block pb-1 text-sm font-semibold text-carbon-black">Email</label>
          <input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={invalid("email")} className={field} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor={`${id}-name`} className="block pb-1 text-sm font-semibold text-carbon-black">Name <span className="font-normal text-slate-grey">(optional)</span></label>
          <input id={`${id}-name`} type="text" autoComplete="name" maxLength={SUPPORT_LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-message`} className="block pb-1 text-sm font-semibold text-carbon-black">Message</label>
        <textarea
          id={`${id}-message`}
          required
          rows={6}
          maxLength={SUPPORT_LIMITS.message}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={invalid("message")}
          className={cn(field, "min-h-36 resize-y leading-6")}
          placeholder="What happened, on which device, and what you expected."
        />
      </div>

      {/* Hidden from people; a bot that fills it is answered as if it sent. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {error && error.field !== "topic" ? <p role="alert" className="text-sm text-blushed-brick">{error.text}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send"}</Button>
        <p className="text-xs leading-5 text-slate-grey">Kept only to answer you. A person reads every message.</p>
      </div>
    </form>
  );
}
