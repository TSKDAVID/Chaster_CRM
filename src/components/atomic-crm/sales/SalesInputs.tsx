import { email, required, useGetIdentity, useRecordContext } from "ra-core";
import { BooleanInput } from "@/components/admin/boolean-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import type { Sale } from "../types";
import { useCurrentRole } from "./useCurrentRole";

const ROLE_CHOICES = [
  { id: "super_admin", name: "Super Admin" },
  { id: "admin", name: "Admin" },
  { id: "member", name: "Member" },
];

export function SalesInputs() {
  const { identity } = useGetIdentity();
  const record = useRecordContext<Sale>();
  const currentRole = useCurrentRole();
  const isSelf = record?.id === identity?.id;

  // Filter role choices based on caller's rank
  const availableRoles =
    currentRole === "super_admin"
      ? ROLE_CHOICES
      : ROLE_CHOICES.filter((r) => r.id === "member");

  return (
    <div className="space-y-4 w-full">
      <TextInput source="first_name" validate={required()} helperText={false} />
      <TextInput source="last_name" validate={required()} helperText={false} />
      <TextInput
        source="email"
        validate={[required(), email()]}
        helperText={false}
      />
      <SelectInput
        source="role"
        choices={availableRoles}
        validate={required()}
        readOnly={isSelf}
        helperText={false}
      />
      <BooleanInput
        source="disabled"
        readOnly={isSelf}
        helperText={false}
      />
    </div>
  );
}
