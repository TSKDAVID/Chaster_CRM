import { useMutation } from "@tanstack/react-query";
import {
  useDataProvider,
  useGetIdentity,
  useNotify,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CrmDataProvider } from "../providers/types";
import type { Sale } from "../types";
import { useCurrentRole } from "./useCurrentRole";

const MIN_LEN = 6;

export function SalesSuperAdminPassword() {
  const record = useRecordContext<Sale>();
  const { identity } = useGetIdentity();
  const currentRole = useCurrentRole();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();

  const [setOpen, setSetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const isSelf = record && identity && record.id === identity.id;
  const isSuper = currentRole === "super_admin";
  const visible = Boolean(record && isSuper && !isSelf);

  const { mutate: setPassword, isPending: setting } = useMutation({
    mutationKey: ["salesSetPassword"],
    mutationFn: async () => {
      if (!record) throw new Error("No record");
      if (newPassword.length < MIN_LEN) {
        throw new Error(
          translate("crm.profile.password.too_short", {
            min: MIN_LEN,
            _: `Password must be at least ${MIN_LEN} characters`,
          }),
        );
      }
      await dataProvider.salesUpdate(record.id, {
        new_password: newPassword,
      });
    },
    onSuccess: () => {
      setSetOpen(false);
      setNewPassword("");
      notify("resources.sales.admin_password.set_success", {
        messageArgs: {
          _: "Password updated for this user.",
        },
      });
    },
    onError: (e) => {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    },
  });

  const { mutate: sendRecovery, isPending: sending } = useMutation({
    mutationKey: ["salesSendRecovery"],
    mutationFn: async () => {
      if (!record) throw new Error("No record");
      await dataProvider.salesUpdate(record.id, {
        send_password_recovery: true,
      });
    },
    onSuccess: () => {
      notify("resources.sales.admin_password.recovery_sent", {
        messageArgs: {
          _: "Password recovery email sent (if SMTP is configured).",
        },
      });
    },
    onError: (e) => {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    },
  });

  if (!visible || !record) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
      <h3 className="text-sm font-semibold">
        {translate("resources.sales.admin_password.title", {
          _: "Password (super admin)",
        })}
      </h3>
      <p className="text-xs text-muted-foreground">
        {translate("resources.sales.admin_password.help", {
          _: "Set a new password immediately or send the user the same email-based reset flow as “Forgot password”.",
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setSetOpen(true)}>
          {translate("resources.sales.admin_password.set_button", {
            _: "Set password",
          })}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={sending}
          onClick={() => sendRecovery()}
        >
          {translate("resources.sales.admin_password.send_recovery", {
            _: "Send reset email",
          })}
        </Button>
      </div>

      <Dialog open={setOpen} onOpenChange={setSetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {translate("resources.sales.admin_password.dialog_title", {
                name: `${record.first_name} ${record.last_name}`,
                _: `Set password for ${record.first_name} ${record.last_name}`,
              })}
            </DialogTitle>
            <DialogDescription>
              {translate("resources.sales.admin_password.dialog_body", {
                _: "The user can sign in with this password immediately. Share it through a secure channel.",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="admin-set-pw">
              {translate("crm.profile.password.new", { _: "New password" })}
            </Label>
            <Input
              id="admin-set-pw"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSetOpen(false)}>
              {translate("ra.action.cancel")}
            </Button>
            <Button
              type="button"
              disabled={setting || newPassword.length < MIN_LEN}
              onClick={() => setPassword()}
            >
              {translate("ra.action.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
