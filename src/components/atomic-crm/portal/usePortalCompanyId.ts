import { useMemo } from "react";

const CURRENT_SALE_CACHE_KEY = "RaStore.auth.current_sale";

export const usePortalCompanyId = (): number | undefined => {
  return useMemo(() => {
    const cached = localStorage.getItem(CURRENT_SALE_CACHE_KEY);
    if (!cached) return undefined;
    const profile = JSON.parse(cached);
    return profile.company_id;
  }, []);
};

export const usePortalProfile = () => {
  return useMemo(() => {
    const cached = localStorage.getItem(CURRENT_SALE_CACHE_KEY);
    if (!cached) return undefined;
    return JSON.parse(cached);
  }, []);
};
