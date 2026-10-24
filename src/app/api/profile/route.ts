// FILE: src/app/api/profile/route.ts
//
// The signed-in learner's profile. GET works in every mode; PATCH is cloud
// only, writing users/{uid} through the Admin SDK (the web onboarding wizard
// and the mobile app both use it, since no client writes Firestore directly).
import { NextResponse } from "next/server";
import { getAppSession, type AppUser } from "@/lib/app-session";
import { parseProfileUpdate } from "@/lib/cloud/profile-input";
import { updateUserProfile } from "@/lib/cloud/store";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAppSession();

  if (!session.mode || !session.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({ mode: session.mode, profile: toProfileResponse(session.user) });
}

export async function PATCH(request: Request) {
  const session = await getAppSession();

  if (!session.mode || !session.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.mode !== "cloud") {
    return NextResponse.json(
      { error: "Profiles can only be edited in Cadence Cloud." },
      { status: 400 },
    );
  }

  const parsed = parseProfileUpdate(await request.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    await updateUserProfile(session.user.id, parsed.update);
  } catch (error) {
    console.error("Profile update failed:", error);
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }

  const user: AppUser = {
    ...session.user,
    ...parsed.update,
    displayName: parsed.update.displayName || session.user.displayName,
  };
  return NextResponse.json({ mode: session.mode, profile: toProfileResponse(user) });
}

function toProfileResponse(user: AppUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    practiceFocus: user.practiceFocus,
    practiceCadence: user.practiceCadence,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
    subscriptionStatus: user.billing?.status ?? null,
  };
}
