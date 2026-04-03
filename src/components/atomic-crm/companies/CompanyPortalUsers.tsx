import { useState } from "react";
import { useNotify, useRecordContext } from "ra-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Mail, Trash2 } from "lucide-react";
import { getSupabaseUrl } from "@/lib/supabaseUrl";
import { supabase } from "../providers/supabase/supabase";
import { AsideSection } from "../misc/AsideSection";
import type { Company } from "../types";

async function fetchPortalUsers(companyId: number) {
  const { data, error } = await supabase
    .from("portal_users")
    .select("id, first_name, last_name, email, role, disabled, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function callEdgeFunction(
  method: string,
  body: Record<string, unknown>,
) {
  const { data: sessionData } = await supabase.auth.getSession();
  const response = await fetch(
    `${getSupabaseUrl()}/functions/v1/portal_users`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token}`,
        apikey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Request failed");
  }
  return response.json();
}

export const CompanyPortalUsers = () => {
  const record = useRecordContext<Company>();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState<number | null>(null);

  const { data: portalUsers = [] } = useQuery({
    queryKey: ["portal_users", record?.id],
    queryFn: () => fetchPortalUsers(record!.id),
    enabled: !!record?.id,
  });

  if (!record || portalUsers.length === 0) return null;

  const handleResendInvite = async (portalUserId: number) => {
    setLoading(portalUserId);
    try {
      await callEdgeFunction("PUT", { portal_user_id: portalUserId });
      notify("Invitation resent", { type: "success" });
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setLoading(null);
    }
  };

  const handleSetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!passwordTarget) return;
    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;

    setLoading(passwordTarget.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/portal_users?action=set_password`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token}`,
            apikey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            portal_user_id: passwordTarget.id,
            password,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to set password");
      }

      notify("Password set successfully", { type: "success" });
      setPasswordTarget(null);
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setLoading(deleteTarget.id);
    try {
      await callEdgeFunction("DELETE", { portal_user_id: deleteTarget.id });
      notify("Portal user removed", { type: "success" });
      queryClient.invalidateQueries({
        queryKey: ["portal_users", record.id],
      });
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setLoading(null);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <AsideSection title="Portal Users">
        <div className="space-y-2">
          {portalUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {user.first_name} {user.last_name}
                </div>
                <div className="text-muted-foreground text-xs truncate">
                  {user.email}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <Badge
                  variant={
                    user.role === "super_admin"
                      ? "default"
                      : user.role === "admin"
                        ? "outline"
                        : "secondary"
                  }
                  className={`text-xs ${user.role === "super_admin" ? "border-purple-400 bg-purple-100 text-purple-700 dark:border-purple-600 dark:bg-purple-900 dark:text-purple-300" : ""}`}
                >
                  {user.role === "super_admin"
                    ? "Super Admin"
                    : user.role === "admin"
                      ? "Admin"
                      : "Member"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Set password"
                  disabled={loading === user.id}
                  onClick={() =>
                    setPasswordTarget({
                      id: user.id,
                      name: `${user.first_name} ${user.last_name}`,
                    })
                  }
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Resend invitation email"
                  disabled={loading === user.id}
                  onClick={() => handleResendInvite(user.id)}
                >
                  <Mail className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  title="Remove portal user"
                  disabled={loading === user.id}
                  onClick={() =>
                    setDeleteTarget({
                      id: user.id,
                      name: `${user.first_name} ${user.last_name}`,
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AsideSection>

      <Dialog
        open={!!passwordTarget}
        onOpenChange={() => setPasswordTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set password for {passwordTarget?.name}</DialogTitle>
            <DialogDescription>
              Set a temporary password so they can log in immediately.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="set_password">Password</Label>
              <Input
                id="set_password"
                name="password"
                type="text"
                required
                minLength={6}
                placeholder="Min 6 characters"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasswordTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading === passwordTarget?.id}>
                Set Password
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove portal user?</DialogTitle>
            <DialogDescription>
              This will permanently delete {deleteTarget?.name}'s portal account.
              They will no longer be able to access the customer portal.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
