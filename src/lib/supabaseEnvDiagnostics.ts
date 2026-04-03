import { getSupabaseUrl } from "@/lib/supabaseUrl";

/**
 * Runs once in development to help debug "Failed to fetch" / unreachable Supabase.
 * Safe: does not log full API keys.
 */
export function runSupabaseEnvDiagnostics(): void {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  const base = getSupabaseUrl();
  const key = import.meta.env.VITE_SB_PUBLISHABLE_KEY as string | undefined;
  const backend = (
    import.meta.env.VITE_SUPABASE_BACKEND_URL as string | undefined
  )?.replace(/\/+$/, "");
  const proxyOn = import.meta.env.VITE_SUPABASE_PROXY_ACTIVE === "true";

  if (!base || !key?.trim()) {
    console.error(
      "[CRM][Supabase] Missing Supabase URL (see VITE_SUPABASE_URL / proxy vars) or VITE_SB_PUBLISHABLE_KEY.",
    );
    return;
  }

  if (
    base.includes("YOUR_PROJECT") ||
    key.includes("your_anon") ||
    key.length < 20
  ) {
    console.warn(
      "[CRM][Supabase] .env still looks like a placeholder. Copy the Project URL and anon/publishable key from Supabase Dashboard → Settings → API.",
    );
    return;
  }

  if (import.meta.env.VITE_SUPABASE_DEV_PROXY === "true" && backend && !proxyOn) {
    console.warn(
      "[CRM][Supabase] Dev proxy requested but inactive (see Vite startup warning — Node DNS ENOTFOUND). Using direct URL.",
    );
  } else if (proxyOn && backend) {
    console.info(
      "[CRM][Supabase] Dev proxy ON — browser hits",
      base,
      "→ Vite forwards to",
      backend,
    );
  }

  const keyKind = key.startsWith("eyJ")
    ? "legacy_anon_jwt"
    : key.startsWith("sb_publishable_")
      ? "publishable"
      : "unknown_format";

  console.info("[CRM][Supabase] Env loaded", {
    url: base,
    apiKeyFormat: keyKind,
    hint:
      keyKind === "unknown_format"
        ? "If auth fails, use the anon key from the dashboard (JWT starting with eyJ… or publishable sb_publishable_…)."
        : undefined,
  });

  const healthUrl = `${base}/auth/v1/health`;
  void (async () => {
    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        headers: { apikey: key },
      });
      if (res.ok) {
        console.info(
          "[CRM][Supabase] Reachable from this browser (auth health OK).",
        );
        return;
      }
      console.warn("[CRM][Supabase] Auth health returned HTTP", res.status);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        "[CRM][Supabase] Not reachable from this browser:",
        msg,
        "\nTry, in order:",
        "\n  1) Open http://localhost:5173 in Chrome or Edge (not only the editor’s embedded browser).",
        "\n  2) Confirm DNS: in PowerShell run: Resolve-DnsName yourproject.supabase.co",
        "\n  3) VPN / firewall / ad-block: allow *.supabase.co",
        "\n  4) Supabase Dashboard: project not paused; Settings → API URL matches .env",
        "\n  5) Same WiFi/corporate proxy that blocks unknown HTTPS",
        "\n  6) Set in .env.development: VITE_SUPABASE_DEV_PROXY=true and VITE_SUPABASE_BACKEND_URL=https://YOUR_REF.supabase.co (keep VITE_SUPABASE_URL as the real URL for production builds). Restart Vite.",
      );
    }
  })();
}
