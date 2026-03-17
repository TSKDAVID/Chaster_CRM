import { useState } from "react";
import {
  useGetIdentity,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
  useDataProvider,
} from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoreHorizontal, ShieldCheck, Shield, User, Ban } from "lucide-react";

import { TopToolbar } from "../layout/TopToolbar";
import { useCurrentRole } from "./useCurrentRole";
import type { CrmDataProvider } from "../providers/types";

const SalesListActions = () => (
  <TopToolbar>
    <ExportButton />
    <CreateButton label="resources.sales.action.new" />
  </TopToolbar>
);

const filters = [<SearchInput source="q" alwaysOn />];

const ROLE_BADGE_STYLES: Record<string, string> = {
  super_admin:
    "border-purple-400 dark:border-purple-600 text-purple-700 dark:text-purple-300",
  admin:
    "border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300",
  member:
    "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Member",
};

const RoleBadge = ({ role }: { role: string }) => (
  <Badge
    variant="outline"
    className={ROLE_BADGE_STYLES[role] ?? ROLE_BADGE_STYLES.member}
  >
    {ROLE_LABELS[role] ?? role}
  </Badge>
);

const StatusField = () => {
  const record = useRecordContext();
  const translate = useTranslate();
  if (!record) return null;

  const role = record.role ?? (record.administrator ? "admin" : "member");

  return (
    <div className="flex flex-row gap-1">
      <RoleBadge role={role} />
      {record.disabled && (
        <Badge
          variant="outline"
          className="border-orange-300 dark:border-orange-700"
        >
          {translate("resources.sales.fields.disabled")}
        </Badge>
      )}
    </div>
  );
};

const ActionsField = () => {
  const record = useRecordContext();
  const { identity } = useGetIdentity();
  const currentRole = useCurrentRole();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [confirmAction, setConfirmAction] = useState<{
    role?: string;
    disabled?: boolean;
    label: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  if (!record) return null;

  const isSelf = record.id === identity?.id;
  const targetRole = record.role ?? (record.administrator ? "admin" : "member");
  const callerRank =
    currentRole === "super_admin" ? 3 : currentRole === "admin" ? 2 : 1;
  const targetRank =
    targetRole === "super_admin" ? 3 : targetRole === "admin" ? 2 : 1;

  // Can only manage if you outrank the target and it's not yourself
  const canManage = !isSelf && callerRank > targetRank;

  if (!canManage) return null;

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setLoading(true);
    try {
      await dataProvider.salesUpdate(record.id, {
        role: confirmAction.role ?? targetRole,
        disabled: confirmAction.disabled ?? record.disabled,
      } as any);
      notify("User updated", { type: "success" });
      refresh();
    } catch (e) {
      notify((e as Error).message || "Failed to update", { type: "error" });
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {callerRank >= 3 && targetRole !== "super_admin" && (
            <DropdownMenuItem
              onClick={() =>
                setConfirmAction({
                  role: "super_admin",
                  label: `Promote ${record.first_name} to Super Admin`,
                })
              }
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Promote to Super Admin
            </DropdownMenuItem>
          )}
          {/* Super admins can demote to admin; admins can promote members to admin */}
          {targetRole !== "admin" &&
            (callerRank >= 3 ||
              (callerRank >= 2 && targetRank < callerRank)) && (
              <DropdownMenuItem
                onClick={() =>
                  setConfirmAction({
                    role: "admin",
                    label: `${targetRank > 2 ? "Demote" : "Promote"} ${record.first_name} to Admin`,
                  })
                }
              >
                <Shield className="h-4 w-4 mr-2" />
                {targetRank > 2 ? "Demote to Admin" : "Promote to Admin"}
              </DropdownMenuItem>
            )}
          {/* Super admins can demote anyone; admins can demote members */}
          {targetRole !== "member" &&
            (callerRank >= 3 ||
              (callerRank >= 2 && targetRank < callerRank)) && (
              <DropdownMenuItem
                onClick={() =>
                  setConfirmAction({
                    role: "member",
                    label: `Demote ${record.first_name} to Member`,
                  })
                }
              >
                <User className="h-4 w-4 mr-2" />
                Demote to Member
              </DropdownMenuItem>
            )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              setConfirmAction({
                disabled: !record.disabled,
                label: record.disabled
                  ? `Enable ${record.first_name}'s account`
                  : `Disable ${record.first_name}'s account`,
              })
            }
          >
            <Ban className="h-4 w-4 mr-2" />
            {record.disabled ? "Enable Account" : "Disable Account"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>{confirmAction?.label}?</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? "Updating..." : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export function SalesList() {
  return (
    <List
      filters={filters}
      actions={<SalesListActions />}
      sort={{ field: "first_name", order: "ASC" }}
    >
      <DataTable>
        <DataTable.Col source="first_name" />
        <DataTable.Col source="last_name" />
        <DataTable.Col source="email" />
        <DataTable.Col label="Role">
          <StatusField />
        </DataTable.Col>
        <DataTable.Col label={false}>
          <ActionsField />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
