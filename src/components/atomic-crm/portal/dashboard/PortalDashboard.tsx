import { useGetList, useGetOne } from "ra-core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart3, CreditCard, Users, Zap } from "lucide-react";
import { usePortalCompanyId } from "../usePortalCompanyId";

export const PortalDashboard = () => {
  const companyId = usePortalCompanyId();

  const { data: subscriptions } = useGetList("subscriptions", {
    filter: { "company_id@eq": companyId },
    pagination: { page: 1, perPage: 1 },
  });

  const { data: usageRecords } = useGetList("usage_records", {
    filter: { "company_id@eq": companyId },
    pagination: { page: 1, perPage: 10 },
    sort: { field: "recorded_at", order: "DESC" },
  });

  const { data: staff } = useGetList("portal_users", {
    filter: { "company_id@eq": companyId },
    pagination: { page: 1, perPage: 100 },
  });

  const subscription = subscriptions?.[0];
  const planId = subscription?.plan_id;

  const { data: plan } = useGetOne(
    "plans",
    { id: planId },
    { enabled: !!planId },
  );

  const activeStaff = staff?.filter((s) => !s.disabled) ?? [];
  const apiUsage =
    usageRecords?.find((u) => u.metric === "api_calls")?.value ?? 0;
  const storageUsage =
    usageRecords?.find((u) => u.metric === "storage_mb")?.value ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your Chaster instance
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {plan?.name ?? "Loading..."}
            </div>
            <p className="text-xs text-muted-foreground">
              {subscription?.status ? (
                <Badge
                  variant={
                    subscription.status === "active" ? "default" : "destructive"
                  }
                >
                  {subscription.status}
                </Badge>
              ) : (
                "No subscription"
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Calls</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {apiUsage.toLocaleString()}
            </div>
            {plan && (
              <>
                <Progress
                  value={(apiUsage / plan.max_api_calls) * 100}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  of {plan.max_api_calls.toLocaleString()} limit
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeStaff.length}</div>
            {plan && (
              <p className="text-xs text-muted-foreground">
                of {plan.max_seats} seats
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{storageUsage} MB</div>
            {plan && (
              <>
                <Progress
                  value={(storageUsage / plan.max_storage_mb) * 100}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  of {plan.max_storage_mb.toLocaleString()} MB limit
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
