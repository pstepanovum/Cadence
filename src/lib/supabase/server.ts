// FILE: src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { assertSupabaseConfig } from "@/lib/supabase/config";

export async function createSupabaseServerClient() {
  const { supabaseUrl, supabasePublishableKey } = assertSupabaseConfig();
  const cookieStore = await cookies();
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    // Mobile clients authenticate with a Bearer token instead of cookies;
    // forwarding it makes PostgREST queries run as that user under RLS.
    ...(authorization?.startsWith("Bearer ")
      ? { global: { headers: { Authorization: authorization } } }
      : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can read cookies but may not be allowed to write them.
        }
      },
    },
  });
}
