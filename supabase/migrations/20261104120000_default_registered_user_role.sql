-- Provision the default QRoute role without trusting client input.
--
-- Every account (email/password or Google OAuth) receives exactly the
-- `registered_user` role from a database trigger. Administrators must still be
-- assigned explicitly by an operator; nothing here grants `admin`.
--
-- Before applying this migration, audit existing triggers on auth.users that
-- may have been created outside this repository. A legacy trigger that grants
-- `admin` based on an email address or sign-up provider must be removed
-- manually, because it would keep granting administrator access after this
-- migration runs. See the final report for the audit query.

create or replace function public.assign_default_qroute_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role, assigned_at)
  values (new.id, 'registered_user', now())
  on conflict do nothing;

  return new;
end;
$$;

comment on function public.assign_default_qroute_role() is
  'Assigns only the default registered_user role to a new auth.users account.';

drop trigger if exists on_auth_user_created_assign_qroute_role
  on auth.users;

create trigger on_auth_user_created_assign_qroute_role
  after insert on auth.users
  for each row
  execute function public.assign_default_qroute_role();

-- Existing accounts created before this migration are backfilled only when
-- they have no role at all. Existing roles, including admin, are preserved.
insert into public.user_roles (user_id, role, assigned_at)
select users.id, 'registered_user', now()
from auth.users as users
where not exists (
  select 1
  from public.user_roles as roles
  where roles.user_id = users.id
)
on conflict do nothing;

-- Role assignment is a server/database responsibility. Browser clients keep
-- their read access for navigation and RLS checks, but can no longer insert,
-- update, or delete role rows.
revoke insert, update, delete, truncate
  on table public.user_roles
  from public, anon, authenticated;
