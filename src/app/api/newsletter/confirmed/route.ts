// FILE: src/app/api/newsletter/confirmed/route.ts
//
// Where Brevo sends the browser after the double opt-in click. Sends the
// newsletter welcome once, then redirects to the /newsletter/confirmed page.
import { after } from "next/server";

import { appOrigin } from "@/lib/server/env";
import { deliverSoon } from "@/lib/server/email/queue";
import { confirmSubscription, verifyConfirmToken } from "@/lib/server/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = verifyConfirmToken(new URL(request.url).searchParams.get("token"));
  if (email) {
    try {
      const result = await confirmSubscription(email);
      if (result.mailKey) after(() => deliverSoon([result.mailKey as string]));
    } catch (error) {
      console.error("Newsletter confirmation failed:", error instanceof Error ? error.message : error);
    }
  }
  return Response.redirect(`${appOrigin()}/newsletter/confirmed`, 303);
}
