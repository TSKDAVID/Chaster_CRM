-- handle_update_user runs on auth.users UPDATE (e.g. last_sign_in_at on every login).
-- Writing NULL into sales.first_name / last_name when raw_user_meta_data omits names
-- violates NOT NULL and fails the trigger → Auth returns "Database error granting user".

create or replace function public.handle_update_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.sales
  set
    first_name = coalesce(new.raw_user_meta_data ->> 'first_name', first_name),
    last_name = coalesce(new.raw_user_meta_data ->> 'last_name', last_name),
    email = new.email
  where user_id = new.id;

  if not found then
    update public.portal_users
    set
      first_name = coalesce(new.raw_user_meta_data ->> 'first_name', first_name),
      last_name = coalesce(new.raw_user_meta_data ->> 'last_name', last_name),
      email = new.email
    where user_id = new.id;
  end if;

  return new;
end;
$$;
