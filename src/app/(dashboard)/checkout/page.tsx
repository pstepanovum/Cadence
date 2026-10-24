// FILE: src/app/(dashboard)/checkout/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutRedirect } from "@/components/billing/CheckoutRedirect";
import { AppPage } from "@/components/ui/app-page";
import { getAppSession } from "@/lib/app-session";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const session = await getAppSession();
  if (session.mode !== "cloud") redirect("/pricing");
  const { plan } = await searchParams;
  if (!session.user) redirect(`/login?next=${encodeURIComponent(`/checkout?plan=${plan === "monthly" ? "monthly" : "yearly"}`)}`);
  if (plan !== "monthly" && plan !== "yearly") redirect("/pricing");
  return (
    <AppPage>
      <CheckoutRedirect interval={plan} />
    </AppPage>
  );
}
