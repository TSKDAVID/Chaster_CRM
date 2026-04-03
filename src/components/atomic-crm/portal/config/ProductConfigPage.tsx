import { useState } from "react";
import { useGetList, useUpdate, useNotify } from "ra-core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePortalCompanyId } from "../usePortalCompanyId";

type ProductConfigPageProps = {
  /** When used as separate resources (`product_configs` vs `chat_widget_configs`), open the matching tab. */
  defaultTab?: "ai-agent" | "chat-widget";
};

export const ProductConfigPage = ({
  defaultTab = "ai-agent",
}: ProductConfigPageProps) => {
  const companyId = usePortalCompanyId();
  const notify = useNotify();

  const { data: configs } = useGetList("product_configs", {
    filter: { "company_id@eq": companyId },
    pagination: { page: 1, perPage: 1 },
  });

  const { data: widgetConfigs } = useGetList("chat_widget_configs", {
    filter: { "company_id@eq": companyId },
    pagination: { page: 1, perPage: 1 },
  });

  const config = configs?.[0]?.config ?? {};
  const widgetConfig = widgetConfigs?.[0]?.config ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Configuration</h2>
        <p className="text-muted-foreground">
          Configure your Chaster AI agents and chat widget
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="ai-agent">AI Agent</TabsTrigger>
          <TabsTrigger value="chat-widget">Chat Widget</TabsTrigger>
        </TabsList>

        <TabsContent value="ai-agent" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Agent Settings</CardTitle>
              <CardDescription>
                Configure how the AI agent responds to your customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Agent Name</Label>
                <Input
                  id="agent-name"
                  placeholder="Support Agent"
                  defaultValue={config.agent_name ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="greeting">Greeting Message</Label>
                <Input
                  id="greeting"
                  placeholder="Hi! How can I help you today?"
                  defaultValue={config.greeting ?? ""}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-reply Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically respond to incoming messages
                  </p>
                </div>
                <Switch defaultChecked={config.auto_reply !== false} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Human Handoff</Label>
                  <p className="text-sm text-muted-foreground">
                    Transfer to a human when AI confidence is low
                  </p>
                </div>
                <Switch defaultChecked={config.human_handoff !== false} />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat-widget" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Chat Widget Appearance</CardTitle>
              <CardDescription>
                Customize the look of the chat widget on your website
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primary-color">Primary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="primary-color"
                    type="color"
                    className="w-16 h-10"
                    defaultValue={widgetConfig.primary_color ?? "#007bff"}
                  />
                  <Input
                    defaultValue={widgetConfig.primary_color ?? "#007bff"}
                    placeholder="#007bff"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">Widget Position</Label>
                <select
                  id="position"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue={widgetConfig.position ?? "bottom-right"}
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="welcome-message">Welcome Message</Label>
                <Input
                  id="welcome-message"
                  placeholder="Welcome! Ask us anything."
                  defaultValue={widgetConfig.welcome_message ?? ""}
                />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
