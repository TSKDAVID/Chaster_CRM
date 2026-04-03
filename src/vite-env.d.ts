/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set at dev compile-time by Vite when the Supabase proxy is active (Node DNS must resolve backend). */
  readonly VITE_SUPABASE_PROXY_ACTIVE?: string;
}
