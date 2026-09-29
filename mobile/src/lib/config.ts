// FILE: mobile/src/lib/config.ts
//
// Cloud mode needs a hosted API and a Supabase project. Local mode needs
// neither: the phone learns the address by scanning a QR on the computer, and
// there is no account at all. So none of these are required to launch any more
// — the app only complains if someone reaches for cloud mode in a build that
// has no cloud configured.
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? null;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? null;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null;

/** Whether this build can offer the hosted option at all. */
export const isCloudConfigured = Boolean(apiUrl && supabaseUrl && supabaseAnonKey);

export const config = {
  apiUrl,
  supabaseUrl,
  supabaseAnonKey,
  isCloudConfigured,
};

export function requireCloudConfig(): {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
} {
  if (!apiUrl || !supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Cadence Cloud is not set up in this build. Connect to a computer instead, or fill in mobile/.env.",
    );
  }

  return { apiUrl, supabaseUrl, supabaseAnonKey };
}
