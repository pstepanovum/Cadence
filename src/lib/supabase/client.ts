// FILE: src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabasePublishableKey } = assertSupabaseConfig();

  if (!browserClient) {
    browserClient = createBrowserClient(
      supabaseUrl,
      supabasePublishableKey,
    );
  }

  return browserClient;
}
