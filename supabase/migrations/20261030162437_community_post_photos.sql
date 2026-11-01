alter table public.community_posts
  add column photo_paths text[] not null default '{}'::text[]
  check (cardinality(photo_paths) <= 5);

grant insert (photo_paths) on public.community_posts to authenticated;

drop policy "Registered users can publish community posts"
  on public.community_posts;
create policy "Registered users can publish community posts"
  on public.community_posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = 'registered_user'
    )
    and not exists (
      select 1 from unnest(photo_paths) as paths(photo_path)
      where split_part(paths.photo_path, '/', 1) <> (select auth.uid())::text
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-post-photos',
  'community-post-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Registered users can read their own community photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'community-post-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Registered users can upload community photos to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-post-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = 'registered_user'
    )
  );

create policy "Registered users can remove their own community photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-post-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
