import { useMutation } from "@tanstack/react-query";
import {
  useDataProvider,
  useGetIdentity,
  useNotify,
  useTranslate,
} from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { CrmDataProvider } from "../providers/types";

const MIN_LEN = 6;

type UserPasswordChangeSectionProps = {
  /** When false, hide the "email reset link" option (e.g. strict SSO-only). */
  showEmailReset?: boolean;
};

export function UserPasswordChangeSection({
  showEmailReset = true,
}: UserPasswordChangeSectionProps) {
  const translate = useTranslate();
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const { mutate: savePassword, isPending: saving } = useMutation({
    mutationKey: ["changeOwnPassword"],
    mutationFn: async () => {
      if (newPassword.length < MIN_LEN) {
        throw new Error(
          translate("crm.profile.password.too_short", {
            min: MIN_LEN,
            _: `Password must be at least ${MIN_LEN} characters`,
          }),
        );
      }
      if (newPassword !== confirm) {
        throw new Error(
          translate("crm.profile.password.mismatch", {
            _: "Passwords do not match",
          }),
        );
      }
      await dataProvider.changeOwnPassword(newPassword);
    },
    onSuccess: () => {
      setNewPassword("");
      setConfirm("");
      notify("crm.profile.password.updated_inline", {
        messageArgs: {
          _: "Your password has been updated",
        },
      });
    },
    onError: (e) => {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    },
  });

  const { mutate: emailReset, isPending: resetting } = useMutation({
    mutationKey: ["updatePasswordEmail"],
    mutationFn: () => {
      if (!identity?.id) {
        throw new Error(
          translate("crm.profile.record_not_found", { _: "Record not found" }),
        );
      }
      return dataProvider.updatePassword(identity.id);
    },
    onSuccess: () => {
      notify("crm.profile.password_reset_sent", {
        messageArgs: {
          _: "A reset password email has been sent to your email address",
        },
      });
    },
    onError: (e) => {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">
          {translate("crm.profile.password.update_title", {
            _: "Update password",
          })}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {translate("crm.profile.password.update_hint", {
            _: "Choose a new password for your account. You stay signed in.",
          })}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="crm-new-password">
          {translate("crm.profile.password.new", { _: "New password" })}
        </Label>
        <Input
          id="crm-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="crm-confirm-password">
          {translate("ra.auth.confirm_password", { _: "Confirm password" })}
        </Label>
        <Input
          id="crm-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button
        type="button"
        disabled={saving || !newPassword || !confirm}
        onClick={() => savePassword()}
      >
        {translate("crm.profile.password.save_new", { _: "Save new password" })}
      </Button>

      {showEmailReset ? (
        <>
          <Separator className="my-4" />
          <p className="text-xs text-muted-foreground">
            {translate("crm.profile.password.email_reset_help", {
              _: "If you forgot your current password, we can email you a reset link instead.",
            })}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={resetting}
            onClick={() => emailReset()}
          >
            {translate("crm.profile.password.email_reset_cta", {
              _: "Email me a reset link",
            })}
          </Button>
        </>
      ) : null}
    </div>
  );
}
