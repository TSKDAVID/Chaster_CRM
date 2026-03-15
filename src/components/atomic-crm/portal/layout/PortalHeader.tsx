import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  Settings,
  Users,
  Building2,
  User,
} from "lucide-react";
import { useUserMenu } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { CanAccess } from "ra-core";

import { useConfigurationContext } from "../../root/ConfigurationContext";

const PortalHeader = () => {
  const { title } = useConfigurationContext();
  const location = useLocation();

  const tabs = [
    { label: "Dashboard", to: "/", path: "/", icon: LayoutDashboard },
    {
      label: "Subscription",
      to: "/subscriptions",
      path: "/subscriptions",
      icon: CreditCard,
    },
    { label: "Usage", to: "/usage_records", path: "/usage_records", icon: BarChart3 },
    {
      label: "Configuration",
      to: "/product_configs",
      path: "/product_configs",
      icon: Settings,
    },
    { label: "Staff", to: "/portal_users", path: "/portal_users", icon: Users },
  ];

  const currentPath =
    tabs.find((tab) => matchPath(tab.path + "/*", location.pathname))?.path ??
    (matchPath("/", location.pathname) ? "/" : false);

  return (
    <nav className="grow">
      <header className="bg-secondary">
        <div className="px-4">
          <div className="flex justify-between items-center flex-1">
            <Link
              to="/"
              className="flex items-center gap-2 text-secondary-foreground no-underline"
            >
              <h1 className="text-xl font-semibold">{title}</h1>
            </Link>
            <div>
              <nav className="flex">
                {tabs.map((tab) => (
                  <NavigationTab
                    key={tab.to}
                    label={tab.label}
                    to={tab.to}
                    isActive={currentPath === tab.path}
                  />
                ))}
              </nav>
            </div>
            <div className="flex items-center">
              <ThemeModeToggle />
              <UserMenu>
                <PortalProfileMenu />
                <PortalAccountMenu />
              </UserMenu>
            </div>
          </div>
        </div>
      </header>
    </nav>
  );
};

const NavigationTab = ({
  label,
  to,
  isActive,
}: {
  label: string;
  to: string;
  isActive: boolean;
}) => (
  <Link
    to={to}
    className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
      isActive
        ? "text-secondary-foreground border-secondary-foreground"
        : "text-secondary-foreground/70 border-transparent hover:text-secondary-foreground/80"
    }`}
  >
    {label}
  </Link>
);

const PortalProfileMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<PortalProfileMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/portal_account" className="flex items-center gap-2">
        <User />
        Profile
      </Link>
    </DropdownMenuItem>
  );
};

const PortalAccountMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<PortalAccountMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/portal_account" className="flex items-center gap-2">
        <Building2 />
        Company Account
      </Link>
    </DropdownMenuItem>
  );
};

export default PortalHeader;
