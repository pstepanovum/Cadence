// FILE: src/lib/supabase/config.ts
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

export function assertSupabaseConfig() {
  if (!isSupabaseConfigured || !supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Supabase is not configured yet. Add your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
    );
  }

  return {
    supabaseUrl,
    supabasePublishableKey,
  };
}
