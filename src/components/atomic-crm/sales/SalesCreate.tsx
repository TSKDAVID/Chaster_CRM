import { useMutation } from "@tanstack/react-query";
import { useDataProvider, useNotify, useRedirect, useTranslate } from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { CrmDataProvider } from "../providers/types";
import type { SalesCreateResult, SalesFormData } from "../types";
import { SalesInputs } from "./SalesInputs";

export function SalesCreate() {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();
  const redirect = useRedirect();

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SalesFormData) => {
      return dataProvider.salesCreate(data);
    },
    onSuccess: (created: SalesCreateResult) => {
      const inv = created.inviteMeta;
      if (inv?.attempted === true && inv.sent === true) {
        notify(
          translate("resources.sales.create.success_invite_sent", {
            _: "User created. An invitation email was sent (ask them to check spam too).",
          }),
          { type: "success" },
        );
      } else if (inv?.attempted === true && inv.sent === false) {
        notify(
          translate("resources.sales.create.warn_invite_not_sent", {
            _: "User created, but the invitation email was not sent. Configure SMTP under Authentication or check Logs → Auth. Reason: %{detail}",
            detail: inv.error?.message ?? "(no message)",
          }),
          { type: "warning" },
        );
      } else {
        notify(
          translate("resources.sales.create.success_no_invite", {
            _: "User created.",
          }),
          { type: "success" },
        );
      }
      redirect("/sales");
    },
    onError: (error) => {
      notify(
        error.message ||
          translate("resources.sales.create.error", {
            _: "An error occurred while creating the user.",
          }),
        {
          type: "error",
        },
      );
    },
  });
  const onSubmit: SubmitHandler<SalesFormData> = async (data) => {
    mutate(data);
  };

  return (
    <div className="max-w-lg w-full mx-auto mt-8">
      <Card>
        <CardHeader>
          <CardTitle>
            {translate("resources.sales.create.title", {
              _: "Create a new user",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleForm onSubmit={onSubmit as SubmitHandler<any>}>
            <SalesInputs />
          </SimpleForm>
        </CardContent>
      </Card>
    </div>
  );
}
