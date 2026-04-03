import { createClient } from "@supabase/supabase-js";

import { getSupabaseUrl } from "@/lib/supabaseUrl";
import { createDebugSupabaseFetch } from "./debugSupabaseFetch";

const publishableKey = import.meta.env.VITE_SB_PUBLISHABLE_KEY;
if (publishableKey === undefined || publishableKey === "") {
  throw new Error(
    "Please set the VITE_SB_PUBLISHABLE_KEY environment variable",
  );
}

/** Resolved after empty-check so edge calls can reuse the same string. */
export const supabasePublishableKey = publishableKey;

export const supabase = createClient(
  getSupabaseUrl(),
  publishableKey,
  {
    global: {
      fetch: createDebugSupabaseFetch(),
    },
  },
);
