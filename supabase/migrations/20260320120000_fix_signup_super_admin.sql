-- Update handle_new_user to set role = 'super_admin' for the first signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  sales_count int;
  user_type text;
  portal_company_id bigint;
  portal_role text;
begin
  user_type := coalesce(new.raw_user_meta_data ->> 'user_type', 'internal');

  if user_type = 'portal' then
    portal_company_id := (new.raw_user_meta_data ->> 'company_id')::bigint;
    portal_role := coalesce(new.raw_user_meta_data ->> 'portal_role', 'member');

    insert into public.portal_users (first_name, last_name, email, user_id, company_id, role)
    values (
      coalesce(new.raw_user_meta_data ->> 'first_name', ''),
      coalesce(new.raw_user_meta_data ->> 'last_name', ''),
      new.email,
      new.id,
      portal_company_id,
      portal_role
    );
  else
    select count(id) into sales_count from public.sales;

    insert into public.sales (first_name, last_name, email, user_id, role, administrator)
    values (
      coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
      coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
      new.email,
      new.id,
      case when sales_count = 0 then 'super_admin' else 'member' end,
      case when sales_count = 0 then TRUE else FALSE end
    );
  end if;

  return new;
end;
$$;
