import type { AuthProvider } from "ra-core";
import { supabaseAuthProvider } from "ra-supabase-core";

import { canAccess } from "../commons/canAccess";
import { supabase } from "./supabase";

const baseAuthProvider = supabaseAuthProvider(supabase, {
  getIdentity: async () => {
    let sale = await getSale();

    // Brief retry: auth session can be ready before the sales/portal_users row
    // is visible in a follow-up read (trigger / replication timing).
    if (sale == null) {
      await new Promise((r) => setTimeout(r, 200));
      sale = await fetchProfileFromDB();
    }

    if (sale == null) {
      throw new Error("Unable to load user profile");
    }

    return {
      id: sale.id,
      fullName: `${sale.first_name} ${sale.last_name}`,
      avatar: sale.avatar?.src,
    };
  },
});

// To speed up checks, we cache the initialization state
// and the current sale in the local storage. They are cleared on logout.
/** Exported so sign-up can set the same key after creating the first user. */
export const IS_INITIALIZED_CACHE_KEY = "RaStore.auth.is_initialized";
const CURRENT_SALE_CACHE_KEY = "RaStore.auth.current_sale";

function getLocalStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export async function getIsInitialized() {
  const storage = getLocalStorage();
  const cachedValue = storage?.getItem(IS_INITIALIZED_CACHE_KEY);
  if (cachedValue != null) {
    return cachedValue === "true";
  }

  const { data, error } = await supabase
    .from("init_state")
    .select("is_initialized")
    .maybeSingle();

  // Do not treat transient errors as "CRM not initialized": that signs the user
  // out and sends them to /sign-up, causing a redirect loop after a successful login.
  if (error) {
    console.warn("[auth] init_state query failed:", error.message);
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      return true;
    }
    return false;
  }

  const raw = data?.is_initialized;
  const isInitialized = Number(raw) > 0;

  if (isInitialized) {
    storage?.setItem(IS_INITIALIZED_CACHE_KEY, "true");
  }

  return isInitialized;
}

export type UserProfile = {
  id: number;
  first_name: string;
  last_name: string;
  avatar?: { src: string };
  userType: "internal" | "portal";
  // internal fields
  administrator?: boolean;
  // portal fields
  company_id?: number;
  role?: string;
};

// Cache TTL: revalidate from DB every 30 seconds so role changes propagate quickly
const CACHE_TTL_MS = 30_000;
const CACHE_TIMESTAMP_KEY = "RaStore.auth.current_sale_ts";

// On first page load, always revalidate from DB so that out-of-band role
// changes (SQL, edge functions) are picked up immediately.
let hasRevalidatedThisSession = false;

const fetchProfileFromDB = async (): Promise<UserProfile | undefined> => {
  const storage = getLocalStorage();

  const { data: dataSession, error: errorSession } =
    await supabase.auth.getSession();

  if (dataSession?.session?.user == null || errorSession) {
    return undefined;
  }

  const userId = dataSession.session.user.id;

  // Try sales first (internal users)
  const { data: dataSale, error: errorSale } = await supabase
    .from("sales")
    .select("id, first_name, last_name, avatar, administrator, role")
    .match({ user_id: userId })
    .single();

  if (dataSale != null && !errorSale) {
    const profile: UserProfile = { ...dataSale, userType: "internal" };
    storage?.setItem(CURRENT_SALE_CACHE_KEY, JSON.stringify(profile));
    storage?.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
    window.dispatchEvent(new Event("auth-profile-changed"));
    return profile;
  }

  // Try portal_users (customer users)
  const { data: dataPortal, error: errorPortal } = await supabase
    .from("portal_users")
    .select("id, first_name, last_name, avatar, company_id, role")
    .match({ user_id: userId })
    .single();

  if (dataPortal != null && !errorPortal) {
    const profile: UserProfile = { ...dataPortal, userType: "portal" };
    storage?.setItem(CURRENT_SALE_CACHE_KEY, JSON.stringify(profile));
    storage?.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
    window.dispatchEvent(new Event("auth-profile-changed"));
    return profile;
  }

  return undefined;
};

const getUserProfile = async (): Promise<UserProfile | undefined> => {
  const storage = getLocalStorage();
  const cachedValue = storage?.getItem(CURRENT_SALE_CACHE_KEY);
  if (cachedValue != null) {
    const parsed = JSON.parse(cachedValue);
    // Invalidate stale cache missing required fields
    if (parsed.userType && parsed.role) {
      // On first access this session, always revalidate from DB so role
      // changes made outside the app (SQL, edge functions) are picked up.
      if (!hasRevalidatedThisSession) {
        hasRevalidatedThisSession = true;
        fetchProfileFromDB();
        return parsed; // return stale while revalidating
      }
      // Check if cache is still fresh
      const ts = Number(storage?.getItem(CACHE_TIMESTAMP_KEY) ?? "0");
      if (Date.now() - ts < CACHE_TTL_MS) {
        return parsed;
      }
      // Cache expired — revalidate in background, return stale for now
      fetchProfileFromDB();
      return parsed;
    }
    storage?.removeItem(CURRENT_SALE_CACHE_KEY);
  }

  return fetchProfileFromDB();
};

// Keep backward compatibility
const getSale = getUserProfile;

function clearCache() {
  const storage = getLocalStorage();
  // Don't clear IS_INITIALIZED_CACHE_KEY — it's app-global, not user-specific.
  // Clearing it after logout causes checkAuth to re-query init_state without
  // a session, which can fail and redirect to sign-up instead of login.
  storage?.removeItem(CURRENT_SALE_CACHE_KEY);
  storage?.removeItem(CACHE_TIMESTAMP_KEY);
  // Clear react-admin's stored "redirect after login" path so that after
  // user-switching, the new user always lands at "/" not the previous user's page.
  storage?.removeItem("@react-admin/nextPathname");
}

export const authProvider: AuthProvider = {
  ...baseAuthProvider,
  // Override checkError: ra-supabase-core logs out on both 401 AND 403.
  // 403 is an RLS/permission denial — it should NOT cause a logout.
  // Only a 401 (invalid/expired JWT) or missing session should trigger logout.
  checkError: async (error) => {
    const status = error?.status ?? error?.response?.status;
    if (status === 401) {
      return Promise.reject(error);
    }
    if (status === 400) {
      // Supabase returns 400 when the session is missing
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        return Promise.reject(error);
      }
    }
    return Promise.resolve();
  },
  login: async (params) => {
    if (params.ssoDomain) {
      const { error } = await supabase.auth.signInWithSSO({
        domain: params.ssoDomain,
      });
      if (error) {
        throw error;
      }
      return;
    }
    // Clear stale profile cache so the new user gets a fresh profile
    const storage = getLocalStorage();
    storage?.removeItem(CURRENT_SALE_CACHE_KEY);
    storage?.removeItem("@react-admin/nextPathname");

    await baseAuthProvider.login(params);

    // Load profile before navigation so getIdentity / layout do not run with an
    // empty cache while the session is new (avoids auth check failures and loops).
    let profile = await getUserProfile();
    if (profile == null) {
      await new Promise((r) => setTimeout(r, 250));
      profile = await fetchProfileFromDB();
    }
    if (profile == null) {
      await supabase.auth.signOut();
      clearCache();
      throw new Error(
        "No CRM profile for this login: no sales / portal_users row linked to this Auth user. After a restore or pause, your admin must link public.sales.user_id to auth.users.id, or you can sign up as the first user if the project is empty.",
      );
    }

    // Return "/" so react-admin navigates to the root dashboard via SPA
    // navigation — no full-page reload, no browser "loading" overlay.
    return "/";
  },
  logout: async (params) => {
    clearCache();
    // Dispatch profile-changed AFTER the base logout completes to avoid
    // mid-logout re-renders that can cause a blank page.
    const result = await baseAuthProvider.logout(params);
    window.dispatchEvent(new Event("auth-profile-changed"));
    return result;
  },
  checkAuth: async (params) => {
    // Users are on the set-password page, nothing to do
    if (
      window.location.pathname === "/set-password" ||
      window.location.hash.includes("#/set-password")
    ) {
      return;
    }
    // Users are on the forgot-password page, nothing to do
    if (
      window.location.pathname === "/forgot-password" ||
      window.location.hash.includes("#/forgot-password")
    ) {
      return;
    }
    // Users are on the sign-up page, nothing to do
    if (
      window.location.pathname === "/sign-up" ||
      window.location.hash.includes("#/sign-up")
    ) {
      return;
    }

    const isInitialized = await getIsInitialized();

    if (!isInitialized) {
      await supabase.auth.signOut();
      throw {
        redirectTo: "/sign-up",
        message: false,
      };
    }

    return baseAuthProvider.checkAuth(params);
  },
  canAccess: async (params) => {
    // Fast path: check localStorage directly to avoid async DB calls
    const storage = getLocalStorage();
    const cachedInit = storage?.getItem(IS_INITIALIZED_CACHE_KEY);
    if (cachedInit === null || cachedInit === undefined) {
      const isInitialized = await getIsInitialized();
      if (!isInitialized) return false;
    } else if (cachedInit !== "true") {
      return false;
    }

    // Fast path: read profile from cache synchronously
    let profile: UserProfile | undefined;
    const cachedProfile = storage?.getItem(CURRENT_SALE_CACHE_KEY);
    if (cachedProfile) {
      const parsed = JSON.parse(cachedProfile);
      if (parsed.userType && parsed.role) {
        profile = parsed;
      }
    }

    // Fallback: fetch from DB (only happens once, then cached)
    if (!profile) {
      profile = await getUserProfile();
      if (profile == null) return false;
    }

    // Compute access rights from the user type and role
    let role: string;
    if (profile.userType === "internal") {
      if (profile.role === "super_admin") role = "super_admin";
      else if (profile.role === "admin" || profile.administrator) role = "admin";
      else role = "user";
    } else {
      if (profile.role === "super_admin") role = "portal_super_admin";
      else if (profile.role === "admin") role = "portal_admin";
      else role = "portal_member";
    }
    return canAccess(role, params);
  },
  getAuthorizationDetails(authorizationId: string) {
    return supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  },
  approveAuthorization(authorizationId: string) {
    return supabase.auth.oauth.approveAuthorization(authorizationId);
  },
  denyAuthorization(authorizationId: string) {
    return supabase.auth.oauth.denyAuthorization(authorizationId);
  },
};
