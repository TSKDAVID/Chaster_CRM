import { useSyncExternalStore } from "react";

const CURRENT_SALE_CACHE_KEY = "RaStore.auth.current_sale";

function getSnapshot(): string {
  try {
    const raw = localStorage.getItem(CURRENT_SALE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.role ?? (parsed.administrator ? "admin" : "member");
    }
  } catch {}
  return "member";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("auth-profile-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("auth-profile-changed", callback);
  };
}

export function useCurrentRole(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => "member");
}
