// FIXME: This should be exported from the ra-core package
type CanAccessParams<
  RecordType extends Record<string, any> = Record<string, any>,
> = {
  action: string;
  resource: string;
  record?: RecordType;
};

const PORTAL_RESOURCES = [
  "portal_dashboard",
  "subscriptions",
  "usage_records",
  "product_configs",
  "chat_widget_configs",
  "portal_users",
  "portal_account",
  "conversations",
];

// Resources accessible by all authenticated users regardless of role
const SHARED_RESOURCES = ["messages"];

export const canAccess = <
  RecordType extends Record<string, any> = Record<string, any>,
>(
  role: string,
  params: CanAccessParams<RecordType>,
) => {
  if (SHARED_RESOURCES.includes(params.resource)) return true;

  // Internal super_admin: same as admin — full CRM access, no portal resources
  if (role === "super_admin") {
    return !PORTAL_RESOURCES.includes(params.resource);
  }

  // Internal admin: full CRM access, no portal resources
  if (role === "admin") {
    return !PORTAL_RESOURCES.includes(params.resource);
  }

  // Internal non-admin: CRM access minus sales/configuration, no portal
  if (role === "user") {
    if (PORTAL_RESOURCES.includes(params.resource)) return false;
    if (params.resource === "sales") return false;
    if (params.resource === "configuration") return false;
    return true;
  }

  // Portal super_admin: full portal access
  if (role === "portal_super_admin") {
    return PORTAL_RESOURCES.includes(params.resource);
  }

  // Portal admin: full portal access
  if (role === "portal_admin") {
    return PORTAL_RESOURCES.includes(params.resource);
  }

  // Portal member: portal access minus staff management writes
  if (role === "portal_member") {
    if (!PORTAL_RESOURCES.includes(params.resource)) return false;
    // Members can view staff but not create/edit/delete
    if (
      params.resource === "portal_users" &&
      params.action !== "list" &&
      params.action !== "show"
    ) {
      return false;
    }
    return true;
  }

  return false;
};
