import { type ReactNode, useMemo } from "react";
import { Layout } from "../layout/Layout";
import { PortalLayout } from "./layout/PortalLayout";

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

export const ConditionalLayout = ({ children }: { children: ReactNode }) => {
  const userType = useMemo(getUserType, []);

  if (userType === "portal") {
    return <PortalLayout>{children}</PortalLayout>;
  }

  return <Layout>{children}</Layout>;
};
