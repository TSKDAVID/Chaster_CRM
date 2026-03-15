import { useGetOne } from "ra-core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { usePortalCompanyId, usePortalProfile } from "../usePortalCompanyId";

export const PortalAccountPage = () => {
  const companyId = usePortalCompanyId();
  const profile = usePortalProfile();

  const { data: company } = useGetOne(
    "companies",
    { id: companyId },
    { enabled: !!companyId },
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Account</h2>
        <p className="text-muted-foreground">
          Your profile and company information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={profile?.first_name ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={profile?.last_name ?? ""} readOnly />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Input
              value={profile?.role === "admin" ? "Administrator" : "Member"}
              readOnly
            />
          </div>
        </CardContent>
      </Card>

      {company && (
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
            <CardDescription>
              Details about your organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={company.name ?? ""} readOnly />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={company.website ?? ""} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={company.phone_number ?? ""} readOnly />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={
                  [company.address, company.city, company.state_abbr, company.country]
                    .filter(Boolean)
                    .join(", ") || ""
                }
                readOnly
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
