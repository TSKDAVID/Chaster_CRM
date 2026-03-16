import { useGetList, useNotify, useRefresh } from "ra-core";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  MoreHorizontal,
  ShieldCheck,
  Shield,
  User,
  Ban,
  UserPlus,
} from "lucide-react";
import { usePortalCompanyId, usePortalProfile } from "../usePortalCompanyId";
import { useState } from "react";
import { PortalStaffInvite } from "./PortalStaffInvite";
import { supabase } from "../../providers/supabase/supabase";

const ROLE_RANK: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  member: 1,
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Member",
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  super_admin:
    "border-purple-400 bg-purple-50 text-purple-700 dark:border-purple-600 dark:bg-purple-900/30 dark:text-purple-300",
  admin:
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  member: "",
};

async function updatePortalUserRole(
  portalUserId: number,
  updates: { role?: string; disabled?: boolean },
) {
  const { data: sessionData } = await supabase.auth.getSession();
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal_users`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token}`,
        apikey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ portal_user_id: portalUserId, ...updates }),
    },
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update user");
  }
  return response.json();
}

export const PortalStaffList = () => {
  const companyId = usePortalCompanyId();
  const profile = usePortalProfile();
  const callerRole = profile?.role ?? "member";
  const callerRank = ROLE_RANK[callerRole] ?? 1;
  const canInvite = callerRank >= 2;
  const [showInvite, setShowInvite] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    userId: number;
    userName: string;
    role?: string;
    disabled?: boolean;
    label: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const notify = useNotify();
  const refresh = useRefresh();

  const { data: staff, isLoading } = useGetList("portal_users", {
    filter: { "company_id@eq": companyId },
    sort: { field: "created_at", order: "ASC" },
    pagination: { page: 1, perPage: 100 },
  });

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setLoading(true);
    try {
      await updatePortalUserRole(confirmAction.userId, {
        role: confirmAction.role,
        disabled: confirmAction.disabled,
      });
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Staff</h2>
          <p className="text-muted-foreground">Manage your team members</p>
        </div>
        {canInvite && (
          <Button onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      {showInvite && (
        <PortalStaffInvite onClose={() => setShowInvite(false)} />
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff?.map((member) => {
                const targetRank = ROLE_RANK[member.role] ?? 1;
                const isSelf = member.id === profile?.id;
                const canManage =
                  !isSelf && callerRank > targetRank && callerRank >= 2;

                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.first_name} {member.last_name}
                    </TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={ROLE_BADGE_STYLES[member.role] ?? ""}
                      >
                        {ROLE_LABELS[member.role] ?? member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          member.disabled ? "destructive" : "outline"
                        }
                      >
                        {member.disabled ? "Disabled" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {callerRank >= 3 &&
                              member.role !== "super_admin" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setConfirmAction({
                                      userId: member.id,
                                      userName: member.first_name,
                                      role: "super_admin",
                                      label: `Promote ${member.first_name} to Super Admin`,
                                    })
                                  }
                                >
                                  <ShieldCheck className="h-4 w-4 mr-2" />
                                  Promote to Super Admin
                                </DropdownMenuItem>
                              )}
                            {callerRank >= 3 && member.role !== "admin" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirmAction({
                                    userId: member.id,
                                    userName: member.first_name,
                                    role: "admin",
                                    label: `${targetRank > 2 ? "Demote" : "Promote"} ${member.first_name} to Admin`,
                                  })
                                }
                              >
                                <Shield className="h-4 w-4 mr-2" />
                                {targetRank > 2
                                  ? "Demote to Admin"
                                  : "Promote to Admin"}
                              </DropdownMenuItem>
                            )}
                            {member.role !== "member" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirmAction({
                                    userId: member.id,
                                    userName: member.first_name,
                                    role: "member",
                                    label: `Demote ${member.first_name} to Member`,
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
                                  userId: member.id,
                                  userName: member.first_name,
                                  disabled: !member.disabled,
                                  label: member.disabled
                                    ? `Enable ${member.first_name}'s account`
                                    : `Disable ${member.first_name}'s account`,
                                })
                              }
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              {member.disabled
                                ? "Enable Account"
                                : "Disable Account"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && (!staff || staff.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No team members found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!confirmAction}
        onOpenChange={() => setConfirmAction(null)}
      >
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
    </div>
  );
};
