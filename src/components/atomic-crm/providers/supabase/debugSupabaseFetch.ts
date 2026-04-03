/**
 * Wraps `fetch` for the Supabase client so "Failed to fetch" and bad HTTP
 * responses are easier to diagnose in DevTools.
 *
 * Enabled when:
 * - `import.meta.env.DEV` is true, or
 * - `localStorage.setItem("CRM_DEBUG_NETWORK", "1")` then reload (works in prod builds too).
 *
 * Disable in prod: `localStorage.removeItem("CRM_DEBUG_NETWORK")`
 */

import { getSupabaseUrl } from "@/lib/supabaseUrl";

function networkDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem("CRM_DEBUG_NETWORK") === "1";
  } catch {
    return false;
  }
}

/** Strip common sensitive query params from logged URLs. */
function sanitizeUrlForLog(url: string): string {
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(url, base);
    const sensitive = ["apikey", "access_token", "refresh_token", "token"];
    for (const key of sensitive) {
      u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url.length > 200 ? `${url.slice(0, 200)}…` : url;
  }
}

function requestMeta(input: RequestInfo | URL, init?: RequestInit) {
  let url: string;
  let method = init?.method ?? "GET";

  if (typeof input === "string") {
    url = input;
  } else if (input instanceof URL) {
    url = input.href;
  } else {
    url = input.url;
    method = input.method || method;
  }

  return { url, method };
}

export function createDebugSupabaseFetch(): typeof fetch {
  const nativeFetch = globalThis.fetch.bind(globalThis);

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const { url, method } = requestMeta(input, init);
    const debug = networkDebugEnabled();

    try {
      const response = await nativeFetch(input, init);

      if (debug && !response.ok) {
        let bodyPreview = "";
        try {
          const text = await response.clone().text();
          bodyPreview = text.length > 600 ? `${text.slice(0, 600)}…` : text;
        } catch {
          bodyPreview = "(could not read body)";
        }

        console.warn("[CRM][Supabase fetch] HTTP error", {
          method,
          url: sanitizeUrlForLog(url),
          status: response.status,
          statusText: response.statusText,
          bodyPreview,
        });
      }

      return response;
    } catch (err) {
      if (debug) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[CRM][Supabase fetch] Network failure (often CORS, wrong URL, offline, or blocked)", {
          method,
          url: sanitizeUrlForLog(url),
          errorName: err instanceof Error ? err.name : typeof err,
          message,
          effectiveUrl: getSupabaseUrl() || "(missing Supabase URL)",
          checks: [
            "Same project: VITE_SUPABASE_URL + VITE_SB_PUBLISHABLE_KEY must match one Supabase project",
            "Reachable: open VITE_SUPABASE_URL/rest/v1/ in browser (expect 401 JSON without key)",
            "Remote project: Dashboard → Settings → API for URL and anon key",
            "Local stack: run `npx supabase start` and use http://127.0.0.1:54321",
          ],
        });
      }
      throw err;
    }
  };
}
