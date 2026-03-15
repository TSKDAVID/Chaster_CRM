import { useGetList, useGetOne } from "ra-core";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { usePortalCompanyId } from "../usePortalCompanyId";

export const UsageDashboard = () => {
  const companyId = usePortalCompanyId();

  const { data: subscriptions } = useGetList("subscriptions", {
    filter: { "company_id@eq": companyId },
    pagination: { page: 1, perPage: 1 },
  });

  const { data: usageRecords } = useGetList("usage_records", {
    filter: { "company_id@eq": companyId },
    sort: { field: "recorded_at", order: "DESC" },
    pagination: { page: 1, perPage: 50 },
  });

  const subscription = subscriptions?.[0];
  const planId = subscription?.plan_id;

  const { data: plan } = useGetOne(
    "plans",
    { id: planId },
    { enabled: !!planId },
  );

  const metrics = [
    {
      key: "api_calls",
      label: "API Calls",
      limit: plan?.max_api_calls ?? 0,
      unit: "",
    },
    {
      key: "seats",
      label: "Active Seats",
      limit: plan?.max_seats ?? 0,
      unit: "",
    },
    {
      key: "storage_mb",
      label: "Storage",
      limit: plan?.max_storage_mb ?? 0,
      unit: "MB",
    },
    {
      key: "conversations",
      label: "Conversations",
      limit: null,
      unit: "",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Usage</h2>
        <p className="text-muted-foreground">
          Monitor your resource consumption
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {metrics.map((metric) => {
          const record = usageRecords?.find((u) => u.metric === metric.key);
          const value = record?.value ?? 0;
          const percentage = metric.limit ? (value / metric.limit) * 100 : 0;
          const isOverLimit = metric.limit ? percentage > 90 : false;

          return (
            <Card key={metric.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {metric.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {value.toLocaleString()}
                  {metric.unit ? ` ${metric.unit}` : ""}
                </div>
                {metric.limit != null && (
                  <>
                    <Progress
                      value={Math.min(percentage, 100)}
                      className={`mt-3 ${isOverLimit ? "[&>div]:bg-destructive" : ""}`}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {percentage.toFixed(1)}% of{" "}
                      {metric.limit.toLocaleString()}
                      {metric.unit ? ` ${metric.unit}` : ""} limit
                    </p>
                  </>
                )}
                {metric.limit == null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    This billing period
                  </p>
                )}
                {record?.period_start && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Period:{" "}
                    {new Date(record.period_start).toLocaleDateString()} -{" "}
                    {new Date(record.period_end).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
