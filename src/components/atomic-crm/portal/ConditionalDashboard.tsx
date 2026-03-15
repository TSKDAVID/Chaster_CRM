import { useMemo } from "react";
import { Dashboard } from "../dashboard/Dashboard";
import { PortalDashboard } from "./dashboard/PortalDashboard";

const CURRENT_SALE_CACHE_KEY = "RaStore.auth.current_sale";

function getUserType(): "internal" | "portal" {
  const cached = localStorage.getItem(CURRENT_SALE_CACHE_KEY);
  if (!cached) return "internal";
  try {
    const profile = JSON.parse(cached);
    return profile.userType ?? "internal";
  } catch {
    return "internal";
  }
}

export const ConditionalDashboard = () => {
  const userType = useMemo(getUserType, []);

  if (userType === "portal") {
    return <PortalDashboard />;
  }

  return <Dashboard />;
};
