begin;

select plan(22);

select ok(
  not has_table_privilege('anon', 'public.community_reports', 'select'),
  'anonymous users have no report-table access'
);
select ok(
  has_table_privilege('authenticated', 'public.community_reports', 'select'),
  'authenticated report reads are governed by RLS'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.community_reports',
    'reporter_id',
    'insert'
  ),
  'clients cannot choose the report author'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.community_reports',
    'status',
    'insert'
  ),
  'clients cannot choose the initial report status'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.community_reports'::regclass
  ),
  'row-level security is enabled'
);

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
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'author1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'author2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'reporter1@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'reporter2@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000005', '10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'admin@test.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

update public.user_roles
set role = 'admin'
where user_id = '10000000-0000-4000-8000-000000000005';

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
  is_hidden
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Author One',
    'Visible report target',
    'Visible post content',
    'Start',
    14.6,
    121.0,
    'Destination',
    14.7,
    121.1,
    false
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'Author Two',
    'Hidden report target',
    'Hidden post content',
    'Start',
    14.6,
    121.0,
    'Destination',
    14.7,
    121.1,
    true
  );

insert into public.community_post_comments (
  id,
  post_id,
  author_id,
  author_display_name,
  content
)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Author One',
  'Visible comment content'
);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  (
    'profile-photos',
    '10000000-0000-4000-8000-000000000001/profile',
    '10000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/png","size":1}'::jsonb
  ),
  (
    'profile-photos',
    '10000000-0000-4000-8000-000000000002/profile',
    '10000000-0000-4000-8000-000000000002',
    '{"mimetype":"image/png","size":1}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

select lives_ok(
  $$
    insert into public.community_reports (
      target_type,
      post_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason
    )
    values (
      'post',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Author One',
      'Visible post content',
      'Spam or misleading content'
    )
  $$,
  'a registered user can report a visible post as themselves'
);

select lives_ok(
  $$
    insert into public.community_reports (
      target_type,
      post_id,
      comment_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason,
      description
    )
    values (
      'comment',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Author One',
      'Visible comment content',
      'Harassment or bullying',
      'Repeated personal attacks.'
    )
  $$,
  'a registered user can report a comment with its parent post'
);

select lives_ok(
  $$
    insert into public.community_reports (
      target_type,
      post_id,
      comment_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason
    )
    values (
      'user',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Author One',
      'Visible comment content',
      'Privacy violation'
    )
  $$,
  'a registered user can report the author associated with a comment'
);

select is(
  (select count(*)::integer from public.community_reports),
  3,
  'reporter can read their own reports'
);

select throws_ok(
  $$
    insert into public.community_reports (
      reporter_id,
      target_type,
      post_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      'post',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Author One',
      'Visible post content',
      'False or misleading information'
    )
  $$,
  '42501',
  null,
  'reporter identity cannot be spoofed'
);

select throws_ok(
  $$
    insert into public.community_reports (
      status,
      target_type,
      post_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason
    )
    values (
      'Reviewed',
      'post',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Author One',
      'Visible post content',
      'False or misleading information'
    )
  $$,
  '42501',
  null,
  'reporter cannot choose moderation status'
);

select throws_ok(
  $$
    insert into public.community_reports (
      target_type,
      post_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason
    )
    values (
      'post',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Author One',
      'Visible post content',
      'False or misleading information'
    )
  $$,
  '23505',
  null,
  'the same reporter cannot submit a duplicate post report'
);

select throws_ok(
  $$
    insert into public.community_reports (
      target_type,
      post_id,
      comment_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason
    )
    values (
      'comment',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Author One',
      'Visible comment content',
      'False or misleading information'
    )
  $$,
  '42501',
  null,
  'comment report must reference its actual parent post'
);

select throws_ok(
  $$
    insert into public.community_reports (
      target_type,
      post_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason
    )
    values (
      'post',
      '20000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002',
      'Author Two',
      'Hidden post content',
      'False or misleading information'
    )
  $$,
  '42501',
  null,
  'registered users cannot report a hidden post'
);

select throws_ok(
  $$
    insert into public.community_reports (
      target_type,
      post_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason,
      description
    )
    values (
      'post',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Author One',
      'Visible post content',
      'Other',
      '   '
    )
  $$,
  '23514',
  null,
  'Other requires a non-empty explanation'
);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'profile-photos'),
  0,
  'registered users cannot list other authors profile objects'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $$
    insert into public.community_reports (
      target_type,
      post_id,
      reported_user_id,
      reported_user_name,
      reported_content,
      reason
    )
    values (
      'post',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Author One',
      'Visible post content',
      'False or misleading information'
    )
  $$,
  '42501',
  null,
  'users cannot report their own post'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000004',
  true
);
select is(
  (select count(*)::integer from public.community_reports),
  0,
  'another registered user cannot read the reporter private queue'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000005',
  true
);
select is(
  (select count(*)::integer from public.community_reports),
  3,
  'admins can read all reports'
);
update public.community_reports
set status = 'Reviewed',
    updated_at = now()
where reporter_id = '10000000-0000-4000-8000-000000000003'
  and target_type = 'post'
  and post_id = '20000000-0000-4000-8000-000000000001';
select is(
  (
    select status
    from public.community_reports
    where reporter_id = '10000000-0000-4000-8000-000000000003'
      and target_type = 'post'
      and post_id = '20000000-0000-4000-8000-000000000001'
  ),
  'Reviewed',
  'admins can update report status'
);
reset role;

select ok(
  (
    select position('storage.object.sign_many' in coalesce(qual, '')) > 0
      and position('registered_user' in coalesce(qual, '')) > 0
      and position('is_hidden' in coalesce(qual, '')) > 0
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Registered users can sign visible Community author photos'
  ),
  'photo policy limits signing to registered users and visible Community authors'
);
select is(
  (
    select public
    from storage.buckets
    where id = 'profile-photos'
  ),
  false,
  'profile photos remain in a private bucket'
);

select * from finish();
rollback;
