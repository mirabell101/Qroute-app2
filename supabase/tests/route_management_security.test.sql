begin;

select plan(63);

select ok(
  exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_role'::regtype
      and enumlabel = 'moderator'
  ),
  'the Moderator role is available'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.submit_contribution(text,jsonb)',
    'execute'
  ),
  'authenticated users submit through the trusted contribution function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.submit_contribution(text,jsonb)',
    'execute'
  ),
  'Visitors cannot submit contributions'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.manage_transit_record(text,text,bigint,jsonb)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'route_management_internal.manage_transit_record_legacy(text,text,bigint,jsonb)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'route_management_internal.manage_transit_record_legacy(text,text,bigint,jsonb)',
      'execute'
    ),
  'only the role-checked Route Management RPC is client-executable'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.manage_transit_record(text,text,bigint,jsonb)',
    'execute'
  ),
  'Visitors cannot call Route Management actions'
);
select ok(
  not has_table_privilege('authenticated', 'public.routes', 'insert'),
  'clients cannot bypass contribution validation with direct route inserts'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.routes',
    'moderation_status',
    'update'
  ),
  'clients cannot directly change route moderation status'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.stops',
    'moderation_status',
    'update'
  )
    and not has_column_privilege(
      'authenticated',
      'public.terminals',
      'moderation_status',
      'update'
    ),
  'clients cannot directly change stop or terminal moderation status'
);
select ok(
  not has_table_privilege('authenticated', 'public.route_stops', 'insert')
    and not has_table_privilege('authenticated', 'public.route_stops', 'update')
    and not has_table_privilege('authenticated', 'public.route_stops', 'delete'),
  'clients cannot directly change ordered route stops'
);
select ok(
  not has_table_privilege('authenticated', 'public.transport_types', 'insert'),
  'clients cannot directly create Transport Types'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.routes'::regclass
  ),
  'route row-level security remains enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.stops'::regclass
  ),
  'stop row-level security remains enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.terminals'::regclass
  ),
  'terminal row-level security remains enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.route_stops'::regclass
  ),
  'ordered route stops retain row-level security'
);
select ok(
  not has_table_privilege('authenticated', 'public.admin_audit_logs', 'update')
    and not has_table_privilege('authenticated', 'public.admin_audit_logs', 'delete'),
  'clients cannot alter or delete audit entries'
);

set local role anon;
select ok(
  not public.is_moderator(),
  'Visitors remain non-moderators when shared RLS policies call the helper'
);
reset role;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'route-admin@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'route-user@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000013', 'authenticated', 'authenticated', 'route-moderator@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

update public.user_roles
set role = case user_id
  when '10000000-0000-4000-8000-000000000011' then 'admin'::public.app_role
  when '10000000-0000-4000-8000-000000000012' then 'registered_user'::public.app_role
  when '10000000-0000-4000-8000-000000000013' then 'moderator'::public.app_role
end
where user_id in (
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000013'
);

create temporary table route_management_test_type (id bigint);
with inserted_type as (
  insert into public.transport_types (name, color)
  values ('Route Management pgTAP ' || gen_random_uuid()::text, '#123456')
  returning id
)
insert into route_management_test_type (id)
select id from inserted_type;
grant select on route_management_test_type to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000011',
  true
);
select ok(
  public.is_moderator(),
  'the database Admin role passes the shared moderation RLS helper'
);
select lives_ok(
  $$
    select public.submit_contribution(
      'stop',
      jsonb_build_object(
        'kind', 'stop',
        'existing_id', null,
        'transport_type_id', (select id from route_management_test_type),
        'name', 'Admin route contribution',
        'description', '',
        'stop_type', 'road_stop',
        'latitude', 14.6,
        'longitude', 121.0
      )
    )
  $$,
  'an Admin can submit through the Contributions workflow'
);
reset role;

select is(
  (
    select moderation_status::text
    from public.stops
    where created_by = '10000000-0000-4000-8000-000000000011'
      and name = 'Admin route contribution'
  ),
  'approved',
  'Admin contributions are automatically approved'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000012',
  true
);
select lives_ok(
  $$
    select public.submit_contribution(
      'stop',
      jsonb_build_object(
        'kind', 'stop',
        'existing_id', null,
        'transport_type_id', (select id from route_management_test_type),
        'name', 'Registered route contribution',
        'description', '',
        'stop_type', 'road_stop',
        'latitude', 14.61,
        'longitude', 121.01
      )
    )
  $$,
  'a Registered User can submit through the Contributions workflow'
);
reset role;

select is(
  (
    select moderation_status::text
    from public.stops
    where created_by = '10000000-0000-4000-8000-000000000012'
      and name = 'Registered route contribution'
  ),
  'pending',
  'Registered User contributions remain pending'
);

update public.stops
set is_active = true,
    is_approved = false,
    is_banned = false,
    is_deleted = false
where created_by = '10000000-0000-4000-8000-000000000012'
  and name = 'Registered route contribution';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000013',
  true
);
select ok(
  public.is_route_moderator(),
  'the database Moderator role passes the Route Management RLS helper'
);
select ok(
  public.is_moderator(),
  'the database Moderator role passes the shared moderation RLS helper'
);
select ok(
  exists (
    select 1
    from public.stops
    where created_by = '10000000-0000-4000-8000-000000000012'
      and name = 'Registered route contribution'
      and is_active IS TRUE
      and is_approved IS FALSE
      and moderation_status = 'pending'
      and is_deleted IS FALSE
      and is_banned IS FALSE
  ),
  'Moderators can read pending active records through RLS'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000012',
  true
);
select ok(
  not public.is_moderator(),
  'Registered Users do not pass the moderation RLS helper'
);
select lives_ok(
  $$
    update public.user_roles
    set role = 'admin'
    where user_id = auth.uid()
  $$,
  'an authenticated user cannot promote their own database role'
);
select throws_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'approve',
      (
        select id
        from public.stops
        where created_by = '10000000-0000-4000-8000-000000000012'
          and name = 'Registered route contribution'
      ),
      '{}'::jsonb
    )
  $$,
  '42501',
  null,
  'Registered Users cannot approve or reject pending contributions'
);
reset role;
select is(
  (
    select role::text
    from public.user_roles
    where user_id = '10000000-0000-4000-8000-000000000012'
  ),
  'registered_user',
  'the trusted Registered User role assignment remains unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000013',
  true
);
select throws_ok(
  $$
    select public.submit_contribution(
      'stop',
      '{}'::jsonb
    )
  $$,
  '42501',
  null,
  'Moderators cannot submit transit contributions'
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'approve',
      (
        select id
        from public.stops
        where created_by = '10000000-0000-4000-8000-000000000012'
          and name = 'Registered route contribution'
      ),
      '{}'::jsonb
    )
  $$,
  'a Moderator can approve a pending contribution'
);
select throws_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'update',
      (
        select id
        from public.stops
        where created_by = '10000000-0000-4000-8000-000000000012'
          and name = 'Registered route contribution'
      ),
      '{"name":"Moderator edit"}'::jsonb
    )
  $$,
  '42501',
  null,
  'a Moderator cannot perform Admin-only record edits'
);
select throws_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'archive',
      (
        select id
        from public.stops
        where created_by = '10000000-0000-4000-8000-000000000012'
          and name = 'Registered route contribution'
      ),
      '{}'::jsonb
    )
  $$,
  '42501',
  null,
  'a Moderator cannot archive managed transit records'
);
reset role;

select is(
  (
    select moderation_status::text
    from public.stops
    where created_by = '10000000-0000-4000-8000-000000000012'
      and name = 'Registered route contribution'
  ),
  'approved',
  'the moderation RPC updates the approved status'
);
select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where admin_user_id = '10000000-0000-4000-8000-000000000013'
      and target_type = 'stop'
      and action_key = 'stop_approved'
  ),
  'Moderator decisions create server-side audit entries'
);
select ok(
  exists (
    select 1
    from public.admin_audit_logs as audit
    join public.admin_action_categories as category
      on category.id = audit.category_id
    where audit.admin_user_id = '10000000-0000-4000-8000-000000000011'
      and audit.target_type = 'stop'
      and audit.action_key = 'stop_created'
      and category.category_key = 'route_management'
  ),
  'Admin submissions create audit entries in the Route Management category'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000011',
  true
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'update',
      (
        select id
        from public.stops
        where created_by = '10000000-0000-4000-8000-000000000011'
          and name = 'Admin route contribution'
      ),
      '{"latitude":14.62,"longitude":121.02}'::jsonb
    )
  $$,
  'an Admin can save updated stop coordinates through the management RPC'
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'archive',
      (
        select id
        from public.stops
        where created_by = '10000000-0000-4000-8000-000000000011'
          and name = 'Admin route contribution'
      ),
      '{}'::jsonb
    )
  $$,
  'an Admin can soft-delete a stop through the management RPC'
);
reset role;

select ok(
  exists (
    select 1
    from public.stops
    where created_by = '10000000-0000-4000-8000-000000000011'
      and name = 'Admin route contribution'
      and latitude = 14.62
      and longitude = 121.02
      and is_deleted IS TRUE
      and deleted_by = '10000000-0000-4000-8000-000000000011'
      and deleted_at IS NOT NULL
  ),
  'Admin coordinate edits and soft-delete metadata persist'
);
select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where admin_user_id = '10000000-0000-4000-8000-000000000011'
      and target_type = 'stop'
      and target_id = (
        select id::text
        from public.stops
        where created_by = '10000000-0000-4000-8000-000000000011'
          and name = 'Admin route contribution'
      )
      and action_key = 'stop_updated'
      and metadata -> 'after' ->> 'latitude' = '14.62'
      and metadata -> 'after' ->> 'longitude' = '121.02'
  ),
  'Admin coordinate changes create server-side audit details'
);
select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where admin_user_id = '10000000-0000-4000-8000-000000000011'
      and target_type = 'stop'
      and target_id = (
        select id::text
        from public.stops
        where created_by = '10000000-0000-4000-8000-000000000011'
          and name = 'Admin route contribution'
      )
      and action_key = 'stop_archived'
      and metadata -> 'after' ->> 'is_deleted' = 'true'
  ),
  'Admin soft-deletions create server-side audit details'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000012',
  true
);
select lives_ok(
  $$
    SELECT public.submit_contribution(
      'route',
      jsonb_build_object(
        'name', contribution.route_name,
        'variant_id', (
          SELECT id FROM public.transport_variants
          WHERE is_active IS TRUE ORDER BY id LIMIT 1
        ),
        'points', jsonb_build_array(
          jsonb_build_object(
            'kind', 'stop', 'existing_id', NULL,
            'transport_type_id', NULL,
            'name', contribution.stop_name,
            'description', '', 'stop_type', 'road_stop',
            'latitude', contribution.latitude,
            'longitude', contribution.longitude
          ),
          jsonb_build_object(
            'kind', 'terminal', 'existing_id', NULL,
            'transport_type_id', NULL,
            'name', contribution.terminal_name,
            'description', '', 'stop_type', 'road_stop',
            'latitude', contribution.latitude + 0.01,
            'longitude', contribution.longitude + 0.01
          )
        )
      )
    )
    FROM (VALUES
      ('Cascade Approval Route', 'Cascade Approval Stop', 'Cascade Approval Terminal', 14.60, 121.00),
      ('Cascade Rejection Route', 'Cascade Rejection Stop', 'Cascade Rejection Terminal', 14.62, 121.02),
      ('Cascade Shared Route', 'Cascade Shared Stop', 'Cascade Target Terminal', 14.64, 121.04),
      ('Cascade Other Route', 'Cascade Other Stop', 'Cascade Other Terminal', 14.66, 121.06)
    ) AS contribution(route_name, stop_name, terminal_name, latitude, longitude)
  $$,
  'a Registered User can submit routes for approval, rejection, and shared-point checks'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000011',
  true
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'route',
      'update',
      (
        select id from public.routes where name = 'Cascade Other Route'
      ),
      jsonb_build_object(
        'stops', jsonb_build_array(
          jsonb_build_object(
            'kind', 'stop',
            'id', (select id from public.stops where name = 'Cascade Shared Stop')
          ),
          jsonb_build_object(
            'kind', 'terminal',
            'id', (select id from public.terminals where name = 'Cascade Other Terminal')
          )
        )
      )
    )
  $$,
  'an Admin can link another route to a pending point'
);
select throws_ok(
  $$
    select public.manage_transit_record(
      'route',
      'update',
      (select id from public.routes where name = 'Cascade Approval Route'),
      '{"moderation_status":"approved"}'::jsonb
    )
  $$,
  '42501',
  null,
  'Admins cannot bypass cascade checks through direct status updates'
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'approve',
      (select id from public.stops where name = 'Cascade Approval Stop'),
      '{}'::jsonb
    )
  $$,
  'an Admin can approve a point before its route is approved'
);
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000013',
  true
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'route',
      'approve',
      (select id from public.routes where name = 'Cascade Approval Route'),
      '{}'::jsonb
    )
  $$,
  'a Moderator can approve a route with exclusively linked pending points'
);
reset role;

select ok(
  exists (
    select 1
    from public.routes AS route_row
    join public.route_stops AS route_stop
      on route_stop.route_id = route_row.id
    join public.stops AS stop_row
      on stop_row.id = route_stop.stop_id
    join public.route_stops AS terminal_link
      on terminal_link.route_id = route_row.id
    join public.terminals AS terminal_row
      on terminal_row.id = terminal_link.terminal_id
    where route_row.name = 'Cascade Approval Route'
      and route_row.moderation_status = 'approved'
      and route_row.is_approved is true
      and route_row.moderated_by = '10000000-0000-4000-8000-000000000013'
      and stop_row.name = 'Cascade Approval Stop'
      and stop_row.moderation_status = 'approved'
      and stop_row.is_approved is true
      and stop_row.moderated_by = '10000000-0000-4000-8000-000000000011'
      and terminal_row.name = 'Cascade Approval Terminal'
      and terminal_row.moderation_status = 'approved'
      and terminal_row.is_approved is true
      and terminal_row.moderated_by = route_row.moderated_by
      and terminal_row.moderated_at = route_row.moderated_at
  ),
  'Route approval atomically approves eligible points with consistent moderation metadata'
);
select ok(
  (
    select count(*) = 2
    from public.admin_audit_logs AS audit
    where audit.admin_user_id = '10000000-0000-4000-8000-000000000013'
      and audit.target_label in (
        'Cascade Approval Route',
        'Cascade Approval Terminal'
      )
      and audit.action_key in ('route_approved', 'stop_approved', 'terminal_approved')
      and audit.metadata ->> 'actor_role' = 'moderator'
  ) = 2,
  'cascade approval writes a role-attributed audit entry for every affected record'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000013',
  true
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'route',
      'reject',
      (select id from public.routes where name = 'Cascade Rejection Route'),
      '{"moderation_note":"Route rejected"}'::jsonb
    )
  $$,
  'a Moderator can reject a route and cascade to exclusively linked points'
);
reset role;
select ok(
  exists (
    select 1
    from public.routes AS route_row
    join public.route_stops AS route_stop
      on route_stop.route_id = route_row.id
    join public.stops AS stop_row
      on stop_row.id = route_stop.stop_id
    join public.route_stops AS terminal_link
      on terminal_link.route_id = route_row.id
    join public.terminals AS terminal_row
      on terminal_row.id = terminal_link.terminal_id
    where route_row.name = 'Cascade Rejection Route'
      and route_row.moderation_status = 'rejected'
      and route_row.is_approved is false
      and route_row.moderation_note = 'Route rejected'
      and stop_row.name = 'Cascade Rejection Stop'
      and stop_row.moderation_status = 'rejected'
      and stop_row.moderation_note = 'Route rejected'
      and terminal_row.name = 'Cascade Rejection Terminal'
      and terminal_row.moderation_status = 'rejected'
      and terminal_row.moderation_note = 'Route rejected'
  ),
  'Route rejection consistently rejects its exclusively linked pending points'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000013',
  true
);
select throws_ok(
  $$
    select public.manage_transit_record(
      'route',
      'approve',
      (select id from public.routes where name = 'Cascade Shared Route'),
      '{}'::jsonb
    )
  $$,
  'P0001',
  'route_management_shared_pending_point',
  'Route approval fails with a clear conflict for a shared pending point'
);
reset role;
select ok(
  exists (
    select 1
    from public.routes AS target_route
    join public.route_stops AS target_link
      on target_link.route_id = target_route.id
    join public.stops AS shared_stop
      on shared_stop.id = target_link.stop_id
    join public.route_stops AS target_terminal_link
      on target_terminal_link.route_id = target_route.id
    join public.terminals AS target_terminal
      on target_terminal.id = target_terminal_link.terminal_id
    join public.routes AS other_route
      on other_route.name = 'Cascade Other Route'
    where target_route.name = 'Cascade Shared Route'
      and target_route.moderation_status = 'pending'
      and target_route.is_approved is false
      and shared_stop.name = 'Cascade Shared Stop'
      and shared_stop.moderation_status = 'pending'
      and target_terminal.name = 'Cascade Target Terminal'
      and target_terminal.moderation_status = 'pending'
      and other_route.moderation_status = 'pending'
  ),
  'shared-point approval conflicts leave every route and point unchanged'
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'route',
      'reject',
      (select id from public.routes where name = 'Cascade Shared Route'),
      '{"moderation_note":"Shared route rejected"}'::jsonb
    )
  $$,
  'a Moderator can reject a route when a pending point is shared'
);
select ok(
  exists (
    select 1
    from public.routes AS target_route
    join public.route_stops AS target_link
      on target_link.route_id = target_route.id
    join public.terminals AS target_terminal
      on target_terminal.id = target_link.terminal_id
    join public.routes AS other_route
      on other_route.name = 'Cascade Other Route'
    join public.stops AS shared_stop
      on shared_stop.name = 'Cascade Shared Stop'
    where target_route.name = 'Cascade Shared Route'
      and target_route.moderation_status = 'rejected'
      and target_terminal.moderation_status = 'rejected'
      and shared_stop.moderation_status = 'pending'
      and other_route.moderation_status = 'pending'
  ),
  'Route rejection leaves the shared point and unrelated route unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000012',
  true
);
select throws_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'mute',
      (select id from public.stops where name = 'Cascade Approval Stop'),
      '{}'::jsonb
    )
  $$,
  '42501',
  null,
  'Registered Users cannot mute map information'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000013',
  true
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'mute',
      (select id from public.stops where name = 'Cascade Approval Stop'),
      '{}'::jsonb
    )
  $$,
  'a Moderator can mute map information'
);
reset role;
select is(
  (
    select is_active
    from public.stops
    where name = 'Cascade Approval Stop'
  ),
  false,
  'muting makes the map information inactive'
);
set local role anon;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000000',
  true
);
select ok(
  not exists (
    select 1 from public.stops where name = 'Cascade Approval Stop'
  ),
  'muted information is hidden from Visitors'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000013',
  true
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'unmute',
      (select id from public.stops where name = 'Cascade Approval Stop'),
      '{}'::jsonb
    )
  $$,
  'a Moderator can unmute map information'
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'ban',
      (select id from public.stops where name = 'Cascade Approval Stop'),
      '{}'::jsonb
    )
  $$,
  'a Moderator can ban map information'
);
reset role;
set local role anon;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000000',
  true
);
select ok(
  not exists (
    select 1 from public.stops where name = 'Cascade Approval Stop'
  ),
  'banned information is hidden from Visitors'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000013',
  true
);
select lives_ok(
  $$
    select public.manage_transit_record(
      'stop',
      'unban',
      (select id from public.stops where name = 'Cascade Approval Stop'),
      '{}'::jsonb
    )
  $$,
  'a Moderator can unban map information'
);
reset role;
select ok(
  exists (
    select 1
    from public.stops
    where name = 'Cascade Approval Stop'
      and moderation_status = 'approved'
      and is_approved is true
      and is_active is true
      and is_banned is false
  ),
  'unmuting and unbanning restore approved map visibility'
);
select ok(
  (
    select count(*) = 4
    from public.admin_audit_logs AS audit
    where audit.admin_user_id = '10000000-0000-4000-8000-000000000013'
      and audit.target_label = 'Cascade Approval Stop'
      and audit.action_key in (
        'stop_muted', 'stop_unmuted', 'stop_banned', 'stop_unbanned'
      )
      and audit.metadata ->> 'actor_role' = 'moderator'
  ),
  'mute and ban actions are individually audited with the verified Moderator role'
);

select * from finish();
rollback;
