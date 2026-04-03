import { useState } from "react";
import { useNotify, useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ShieldPlus } from "lucide-react";
import { getSupabaseUrl } from "@/lib/supabaseUrl";
import { supabase } from "../providers/supabase/supabase";
import type { Company } from "../types";

export const InvitePortalAdmin = () => {
  const record = useRecordContext<Company>();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!record) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const firstName = formData.get("first_name") as string;
    const lastName = formData.get("last_name") as string;

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/portal_users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token}`,
            apikey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            email,
            first_name: firstName,
            last_name: lastName,
            company_id: record.id,
            role: "admin",
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to invite user");
      }

      notify("Portal admin invited successfully. They will receive an email.", {
        type: "success",
      });
      setOpen(false);
    } catch (error) {
      notify((error as Error).message, { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ShieldPlus className="h-4 w-4" />
          Invite Portal Admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Portal Admin</DialogTitle>
          <DialogDescription>
            Invite a customer admin for {record.name}. They'll get access to the
            self-service portal to manage their subscription, usage, and team.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invite_first_name">First Name</Label>
              <Input id="invite_first_name" name="first_name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite_last_name">Last Name</Label>
              <Input id="invite_last_name" name="last_name" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite_email">Email</Label>
            <Input id="invite_email" name="email" type="email" required />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send Invitation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
