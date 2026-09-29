import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { config, isCloudConfigured } from "@/lib/config";

// A local-only build has no Supabase project, and importing this module must
// not bring the app down for someone who is only ever going to pair with their
// own computer. The placeholder client is never signed in, so every cloud path
// simply reports "not signed in" rather than throwing at import time.
export const supabase = createClient(
  config.supabaseUrl ?? "http://localhost",
  config.supabaseAnonKey ?? "local-mode-placeholder",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: isCloudConfigured,
      persistSession: isCloudConfigured,
      detectSessionInUrl: false,
    },
  },
);

// Supabase recommends pausing token auto-refresh while the app is backgrounded.
AppState.addEventListener("change", (state) => {
  if (!isCloudConfigured) {
    return;
  }

  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
