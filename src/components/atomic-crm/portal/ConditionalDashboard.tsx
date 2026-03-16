import { Dashboard } from "../dashboard/Dashboard";
import { PortalDashboard } from "./dashboard/PortalDashboard";
import { useUserType } from "./useUserType";

export const ConditionalDashboard = () => {
  const userType = useUserType();

  if (userType === "portal") {
    return <PortalDashboard />;
  }

  return <Dashboard />;
};
