-- Add role column to sales table
alter table sales add column role text not null default 'member';

-- Backfill from administrator boolean
update sales set role = 'admin' where administrator = true;
update sales set role = 'member' where administrator = false;

-- Make the first admin a super_admin
update sales set role = 'super_admin'
where id = (select min(id) from sales where administrator = true);

-- Add check constraints
alter table sales add constraint chk_sales_role
  check (role in ('super_admin', 'admin', 'member'));

alter table portal_users add constraint chk_portal_users_role
  check (role in ('super_admin', 'admin', 'member'));

-- Prevent removing the last super_admin from sales
create or replace function prevent_last_super_admin_sales()
returns trigger as $$
begin
  if OLD.role = 'super_admin' and NEW.role <> 'super_admin' then
    if (select count(*) from sales where role = 'super_admin' and id <> OLD.id) = 0 then
      raise exception 'Cannot remove the last super admin';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_prevent_last_super_admin_sales
  before update on sales
  for each row
  execute function prevent_last_super_admin_sales();

-- Prevent removing the last super_admin from portal_users (per company)
create or replace function prevent_last_super_admin_portal()
returns trigger as $$
begin
  if OLD.role = 'super_admin' and NEW.role <> 'super_admin' then
    if (select count(*) from portal_users
        where role = 'super_admin'
          and company_id = OLD.company_id
          and id <> OLD.id) = 0 then
      raise exception 'Cannot remove the last super admin for this company';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_prevent_last_super_admin_portal
  before update on portal_users
  for each row
  execute function prevent_last_super_admin_portal();

-- Keep administrator boolean in sync with role (backward compat)
create or replace function sync_administrator_from_role()
returns trigger as $$
begin
  NEW.administrator = NEW.role in ('super_admin', 'admin');
  return NEW;
end;
$$ language plpgsql;

create trigger trg_sync_administrator
  before insert or update on sales
  for each row
  execute function sync_administrator_from_role();

-- Enable realtime on dm_conversations for efficient list updates
alter publication supabase_realtime add table dm_conversations;
