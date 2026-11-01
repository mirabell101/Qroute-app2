-- Authors can read their own active submissions while they are pending or
-- rejected. Public visibility and moderator access keep their existing rules.
drop policy if exists "Hide unapproved or removed terminals" on public.terminals;
create policy "Hide unapproved or removed terminals"
  on public.terminals as restrictive for select to authenticated
  using (
    public.is_moderator()
    or (
      created_by = (select auth.uid())
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role = 'registered_user'
      )
      and coalesce(is_deleted, false) = false
      and deleted_at is null
      and coalesce(is_banned, false) = false
    )
    or (
      is_approved is true
      and moderation_status = 'approved'
      and is_active is true
      and coalesce(is_deleted, false) = false
      and deleted_at is null
      and coalesce(is_banned, false) = false
    )
  );

drop policy if exists "Hide unapproved or removed stops" on public.stops;
create policy "Hide unapproved or removed stops"
  on public.stops as restrictive for select to authenticated
  using (
    public.is_moderator()
    or (
      created_by = (select auth.uid())
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role = 'registered_user'
      )
      and coalesce(is_deleted, false) = false
      and deleted_at is null
      and coalesce(is_banned, false) = false
    )
    or (
      is_approved is true
      and moderation_status = 'approved'
      and is_active is true
      and coalesce(is_deleted, false) = false
      and deleted_at is null
      and coalesce(is_banned, false) = false
    )
  );

drop policy if exists "Hide unapproved or removed routes" on public.routes;
create policy "Hide unapproved or removed routes"
  on public.routes as restrictive for select to authenticated
  using (
    public.is_moderator()
    or (
      created_by = (select auth.uid())
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.role = 'registered_user'
      )
      and coalesce(is_deleted, false) = false
      and deleted_at is null
      and coalesce(is_banned, false) = false
    )
    or (
      is_approved is true
      and moderation_status = 'approved'
      and is_active is true
      and coalesce(is_deleted, false) = false
      and deleted_at is null
      and coalesce(is_banned, false) = false
    )
  );
