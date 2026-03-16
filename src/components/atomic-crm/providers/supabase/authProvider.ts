import type { AuthProvider } from "ra-core";
import { supabaseAuthProvider } from "ra-supabase-core";

import { canAccess } from "../commons/canAccess";
import { supabase } from "./supabase";

const baseAuthProvider = supabaseAuthProvider(supabase, {
  getIdentity: async () => {
    const sale = await getSale();

    if (sale == null) {
      throw new Error();
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
const IS_INITIALIZED_CACHE_KEY = "RaStore.auth.is_initialized";
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

  const { data } = await supabase.from("init_state").select("is_initialized");
  const isInitialized = data?.at(0)?.is_initialized > 0;

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
  storage?.removeItem(IS_INITIALIZED_CACHE_KEY);
  storage?.removeItem(CURRENT_SALE_CACHE_KEY);
  storage?.removeItem(CACHE_TIMESTAMP_KEY);
  window.dispatchEvent(new Event("auth-profile-changed"));
}

export const authProvider: AuthProvider = {
  ...baseAuthProvider,
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

    await baseAuthProvider.login(params);

    // After login, fetch the new user's profile and redirect to the right place
    const profile = await getUserProfile();
    if (profile && profile.userType === "portal") {
      return { redirectTo: "/portal_dashboard" };
    }
  },
  logout: async (params) => {
    clearCache();
    return baseAuthProvider.logout(params);
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
