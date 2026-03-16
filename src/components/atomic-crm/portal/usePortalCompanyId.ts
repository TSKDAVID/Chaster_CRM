import { useSyncExternalStore } from "react";

const CURRENT_SALE_CACHE_KEY = "RaStore.auth.current_sale";

function getProfileSnapshot(): any | undefined {
  try {
    const cached = localStorage.getItem(CURRENT_SALE_CACHE_KEY);
    if (!cached) return undefined;
    return JSON.parse(cached);
  } catch {
    return undefined;
  }
}

// Keep a stable reference for useSyncExternalStore — only update when the
// serialized value actually changes.
let cachedRaw: string | null = null;
let cachedParsed: any | undefined = undefined;

function getSnapshot(): any | undefined {
  const raw = localStorage.getItem(CURRENT_SALE_CACHE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedParsed = raw ? JSON.parse(raw) : undefined;
  }
  return cachedParsed;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("auth-profile-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("auth-profile-changed", callback);
  };
}

export const usePortalCompanyId = (): number | undefined => {
  const profile = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
  return profile?.company_id;
};

export const usePortalProfile = () => {
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
};
