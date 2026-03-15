import { useGetList, useGetOne } from "ra-core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Check } from "lucide-react";
import { usePortalCompanyId } from "../usePortalCompanyId";

export const SubscriptionPage = () => {
  const companyId = usePortalCompanyId();

  const { data: subscriptions } = useGetList("subscriptions", {
    filter: { "company_id@eq": companyId },
    pagination: { page: 1, perPage: 1 },
  });

  const { data: plans } = useGetList("plans", {
    filter: { "is_active@eq": true },
    sort: { field: "price_monthly", order: "ASC" },
    pagination: { page: 1, perPage: 10 },
  });

  const subscription = subscriptions?.[0];
  const currentPlanId = subscription?.plan_id;

  const { data: currentPlan } = useGetOne(
    "plans",
    { id: currentPlanId },
    { enabled: !!currentPlanId },
  );

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Subscription</h2>
        <p className="text-muted-foreground">
          Manage your plan and billing
        </p>
      </div>

      {subscription && currentPlan && (
        <Card>
          <CardHeader>
            <CardTitle>Current Plan: {currentPlan.name}</CardTitle>
            <CardDescription>
              <Badge
                variant={
                  subscription.status === "active" ? "default" : "destructive"
                }
              >
                {subscription.status}
              </Badge>
              {" "}
              &middot; Renews{" "}
              {new Date(subscription.current_period_end).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Seats</p>
                <p className="font-medium">{currentPlan.max_seats}</p>
              </div>
              <div>
                <p className="text-muted-foreground">API Calls</p>
                <p className="font-medium">
                  {currentPlan.max_api_calls.toLocaleString()}/mo
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Storage</p>
                <p className="font-medium">
                  {currentPlan.max_storage_mb.toLocaleString()} MB
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-4">Available Plans</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {plans?.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const features = plan.features as Record<string, any>;

            return (
              <Card
                key={plan.id}
                className={isCurrent ? "border-primary" : ""}
              >
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    {plan.name}
                    {isCurrent && <Badge>Current</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {plan.price_monthly
                      ? `${formatPrice(plan.price_monthly)}/mo`
                      : "Contact us"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      {plan.max_seats} seats
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      {plan.max_api_calls.toLocaleString()} API calls/mo
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      {plan.max_storage_mb.toLocaleString()} MB storage
                    </li>
                    {features.ai_agents && (
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        {features.ai_agents === -1
                          ? "Unlimited"
                          : features.ai_agents}{" "}
                        AI agents
                      </li>
                    )}
                    {features.custom_branding && (
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        Custom branding
                      </li>
                    )}
                    {features.priority_support && (
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        Priority support
                      </li>
                    )}
                  </ul>
                  <Button
                    className="w-full mt-4"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={isCurrent}
                  >
                    {isCurrent ? "Current Plan" : "Upgrade"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
