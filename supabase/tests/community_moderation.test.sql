begin;

select plan(19);

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
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'author@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'reporter1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'reporter2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'reporter3@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000005', '10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'admin1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000006', '10000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'admin2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

update public.user_roles
set role = 'admin'
where user_id in (
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006'
);

insert into public.community_posts (
  id,
  author_id,
  author_display_name,
  title,
  content,
  start_name,
  start_latitude,
  start_longitude,
  destination_name,
  destination_latitude,
  destination_longitude,
  photo_paths
)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Test Author',
  'Visible until hidden',
  'Test content',
  'Start',
  14.6,
  121.0,
  'Destination',
  14.7,
  121.1,
  array['10000000-0000-4000-8000-000000000001/test-photo.jpg']
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $$
    insert into public.reports (
      type,
      reason,
      reported_content,
      reporter,
      reported_user,
      status,
      description
    )
    values (
      'General',
      'Legacy report',
      'Unlinked content',
      'legacy reporter',
      'unknown',
      'Pending',
      'An unlinked report remains allowed and is not a Community threshold vote.'
    )
  $$,
  'authenticated users can still submit unlinked legacy reports'
);

reset role;
select is(
  (select count(*)::integer from public.admin_notifications),
  0,
  'an unlinked legacy report does not create an admin notification'
);

set local role authenticated;
select throws_ok(
  $$
    insert into public.reports (
      type,
      reason,
      reported_content,
      reporter,
      reported_user,
      status,
      description,
      community_post_id,
      reporter_user_id
    )
    values (
      'Post',
      'Spam',
      'Visible until hidden',
      'Reporter 1',
      'Test Author',
      'Pending',
      'Direct linked inserts must use the authorized server endpoint.',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot directly insert linked Community reports'
);
reset role;

set local role service_role;
insert into public.reports (
  type,
  reason,
  reported_content,
  reporter,
  reported_user,
  status,
  description,
  community_post_id,
  reporter_user_id
)
values
  ('Post', 'Spam', 'Visible until hidden', 'Reporter 1', 'Test Author', 'Pending', 'First unique report.', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
  ('Post', 'Spam', 'Visible until hidden', 'Reporter 2', 'Test Author', 'Pending', 'Second unique report.', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003');
reset role;

select is(
  (select count(*)::integer from public.admin_notifications),
  0,
  'two unique pending reports do not reach the threshold'
);

set local role service_role;
insert into public.reports (
  type,
  reason,
  reported_content,
  reporter,
  reported_user,
  status,
  description,
  community_post_id,
  reporter_user_id
)
values (
  'Post',
  'Spam',
  'Visible until hidden',
  'Reporter 3',
  'Test Author',
  'Pending',
  'Third unique report reaches the threshold.',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004'
);
reset role;

select is(
  (select count(*)::integer from public.admin_notifications),
  1,
  'the third unique pending report creates one notification'
);

set local role service_role;
select throws_ok(
  $$
    insert into public.reports (
      type,
      reason,
      reported_content,
      reporter,
      reported_user,
      status,
      description,
      community_post_id,
      reporter_user_id
    )
    values (
      'Post',
      'Spam',
      'Visible until hidden',
      'Reporter 3',
      'Test Author',
      'Pending',
      'A duplicate reporter/post pair must fail.',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000004'
    )
  $$,
  '23505',
  null,
  'the same registered user cannot report the same post twice'
);

update public.reports
set status = 'Reviewed'
where community_post_id = '20000000-0000-4000-8000-000000000001'
  and reporter_user_id = '10000000-0000-4000-8000-000000000002';
update public.reports
set status = 'Pending'
where community_post_id = '20000000-0000-4000-8000-000000000001'
  and reporter_user_id = '10000000-0000-4000-8000-000000000002';
reset role;

select is(
  (select count(*)::integer from public.admin_notifications),
  1,
  'a later threshold check does not duplicate the per-post event'
);

select ok(
  (
    public.get_public_community_data(
      array['20000000-0000-4000-8000-000000000001']::uuid[],
      true,
      false
    )->'posts'->0->'photo_paths'
  ) ? '10000000-0000-4000-8000-000000000001/test-photo.jpg',
  'the public RPC returns photo paths for visible posts'
);

select is(
  (
    select public
    from storage.buckets
    where id = 'community-post-photos'
  ),
  false,
  'Community photos are stored in a private bucket'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);
update public.community_posts
set is_hidden = true
where id = '20000000-0000-4000-8000-000000000001';
select is(
  (
    select is_hidden
    from public.community_posts
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  false,
  'registered users cannot hide posts'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*)::integer from public.admin_notifications),
  0,
  'regular users cannot read admin notification events'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000005',
  true
);
select is(
  (select count(*)::integer from public.admin_notifications),
  1,
  'admins can read notification events'
);
insert into public.admin_notification_reads (
  notification_id,
  admin_user_id,
  read_at
)
select
  id,
  '10000000-0000-4000-8000-000000000005',
  now()
from public.admin_notifications
where post_id = '20000000-0000-4000-8000-000000000001'
on conflict do nothing;
select is(
  (
    select count(*)::integer
    from public.admin_notification_reads
    where admin_user_id = '10000000-0000-4000-8000-000000000005'
  ),
  1,
  'an admin can create their own read receipt'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000006',
  true
);
select is(
  (
    select count(*)::integer
    from public.admin_notification_reads
    where admin_user_id = '10000000-0000-4000-8000-000000000005'
  ),
  0,
  'another admin cannot read the first admin receipt'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000005',
  true
);
update public.community_posts
set is_hidden = true
where id = '20000000-0000-4000-8000-000000000001';
select is(
  (
    select is_hidden
    from public.community_posts
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  true,
  'admins can change post visibility'
);
reset role;

set local role anon;
select is(
  (
    select count(*)::integer
    from public.community_posts
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  0,
  'anonymous users cannot read hidden posts'
);
select is(
  (
    public.get_public_community_data(
      array['20000000-0000-4000-8000-000000000001']::uuid[],
      true,
      false
    )->'posts'
  ),
  '[]'::jsonb,
  'the public RPC omits hidden posts and their photo paths'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);
select is(
  (
    select count(*)::integer
    from public.community_posts
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  0,
  'registered users cannot read hidden posts'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000005',
  true
);
select is(
  (
    select count(*)::integer
    from public.community_posts
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  1,
  'admins can read hidden posts'
);
reset role;

select * from finish();
rollback;
