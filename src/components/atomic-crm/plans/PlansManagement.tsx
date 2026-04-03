import { List } from "@/components/admin/list";
import { DataTable } from "@/components/admin/data-table";
import { TextField } from "@/components/admin/text-field";
import { NumberField } from "@/components/admin/number-field";
import { ListPagination } from "@/components/admin/list-pagination";
import { TopToolbar } from "../layout/TopToolbar";
import { ExportButton } from "@/components/admin/export-button";

/**
 * Internal route listing subscription plans (`plans` table).
 * Mutations typically require service role / edge functions depending on RLS.
 */
export const PlansManagement = () => (
  <List
    resource="plans"
    title="Plans"
    perPage={25}
    sort={{ field: "name", order: "ASC" }}
    actions={
      <TopToolbar>
        <ExportButton />
      </TopToolbar>
    }
    pagination={<ListPagination rowsPerPageOptions={[10, 25, 50]} />}
  >
    <DataTable>
      <DataTable.Col source="id" />
      <DataTable.Col label="Name">
        <TextField source="name" />
      </DataTable.Col>
      <DataTable.Col label="Max seats">
        <NumberField source="max_seats" />
      </DataTable.Col>
      <DataTable.Col label="API calls / period">
        <NumberField source="max_api_calls" />
      </DataTable.Col>
      <DataTable.Col label="Storage (MB)">
        <NumberField source="max_storage_mb" />
      </DataTable.Col>
      <DataTable.Col label="Monthly (cents)">
        <NumberField source="price_monthly" empty="—" />
      </DataTable.Col>
      <DataTable.Col label="Yearly (cents)">
        <NumberField source="price_yearly" empty="—" />
      </DataTable.Col>
      <DataTable.Col label="Active">
        <TextField source="is_active" />
      </DataTable.Col>
    </DataTable>
  </List>
);
