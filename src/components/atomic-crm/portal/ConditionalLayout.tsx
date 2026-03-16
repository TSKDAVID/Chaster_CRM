import { type ReactNode } from "react";
import { Layout } from "../layout/Layout";
import { PortalLayout } from "./layout/PortalLayout";
import { useUserType } from "./useUserType";

export const ConditionalLayout = ({ children }: { children: ReactNode }) => {
  const userType = useUserType();

  if (userType === "portal") {
    return <PortalLayout>{children}</PortalLayout>;
  }

  return <Layout>{children}</Layout>;
};
