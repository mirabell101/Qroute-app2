begin;

select plan(39);

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
  ),
  'authenticated clients can request role-checked Route Management actions'
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

select * from finish();
rollback;
