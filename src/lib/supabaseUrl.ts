/**
 * Resolves the URL passed to `createClient` / ra-supabase data provider.
 *
 * In development, set `VITE_SUPABASE_DEV_PROXY=true` and `VITE_SUPABASE_BACKEND_URL`
 * so traffic can go via Vite (`/__supabase` → backend). Vite sets
 * `import.meta.env.VITE_SUPABASE_PROXY_ACTIVE` at build time: it stays false if Node.js
 * cannot resolve the backend host (otherwise the proxy returns empty bodies).
 */
export function getSupabaseUrl(): string {
  const configured = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const backend = (import.meta.env.VITE_SUPABASE_BACKEND_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const useProxy =
    import.meta.env.DEV &&
    import.meta.env.VITE_SUPABASE_PROXY_ACTIVE === "true" &&
    backend.length > 0;

  if (useProxy) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/__supabase`;
    }
    return backend;
  }

  return configured;
}
