import { useSyncExternalStore } from "react";

const CURRENT_SALE_CACHE_KEY = "RaStore.auth.current_sale";

function getSnapshot(): "internal" | "portal" {
  const cached = localStorage.getItem(CURRENT_SALE_CACHE_KEY);
  if (!cached) return "internal";
  try {
    const profile = JSON.parse(cached);
    return profile.userType ?? "internal";
  } catch {
    return "internal";
  }
}

function subscribe(callback: () => void) {
  // Listen for storage changes (cross-tab) and custom event (same-tab)
  window.addEventListener("storage", callback);
  window.addEventListener("auth-profile-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("auth-profile-changed", callback);
  };
}

export function useUserType(): "internal" | "portal" {
  return useSyncExternalStore(subscribe, getSnapshot, () => "internal");
}
