create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_display_name text not null check (char_length(author_display_name) between 1 and 120),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 5000),
  start_name text not null check (char_length(start_name) between 1 and 180),
  start_latitude double precision not null check (start_latitude between -90 and 90),
  start_longitude double precision not null check (start_longitude between -180 and 180),
  destination_name text not null check (char_length(destination_name) between 1 and 180),
  destination_latitude double precision not null check (destination_latitude between -90 and 90),
  destination_longitude double precision not null check (destination_longitude between -180 and 180),
  transport_type_id bigint references public.transport_types(id) on delete set null,
  created_at timestamptz not null default now()
);

create index community_posts_created_at_idx
  on public.community_posts (created_at desc);
create index community_posts_author_created_at_idx
  on public.community_posts (author_id, created_at desc);

create table public.community_post_votes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote_type text not null check (vote_type in ('upvote', 'downvote')),
  created_at timestamptz not null default now(),
  constraint community_post_votes_post_user_key unique (post_id, user_id)
);

create index community_post_votes_post_type_idx
  on public.community_post_votes (post_id, vote_type);

create table public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_display_name text not null check (char_length(author_display_name) between 1 and 120),
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index community_post_comments_post_created_idx
  on public.community_post_comments (post_id, created_at);

alter table public.community_posts enable row level security;
alter table public.community_post_votes enable row level security;
alter table public.community_post_comments enable row level security;

revoke all on public.community_posts from anon, authenticated;
revoke all on public.community_post_votes from anon, authenticated;
revoke all on public.community_post_comments from anon, authenticated;

grant select on public.community_posts to anon, authenticated;
grant insert on public.community_posts to authenticated;
grant select (post_id, vote_type) on public.community_post_votes to anon;
grant select on public.community_post_votes to authenticated;
grant insert (post_id, user_id, vote_type) on public.community_post_votes to authenticated;
grant update (vote_type) on public.community_post_votes to authenticated;
grant delete on public.community_post_votes to authenticated;
grant select on public.community_post_comments to anon, authenticated;
grant insert (post_id, author_id, author_display_name, content)
  on public.community_post_comments to authenticated;

create policy "Anyone can read community posts"
  on public.community_posts for select to anon, authenticated
  using (true);

create policy "Registered users can publish community posts"
  on public.community_posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = 'registered_user'
    )
  );

create policy "Anyone can read public vote values"
  on public.community_post_votes for select to anon
  using (true);

create policy "Users can read their own votes"
  on public.community_post_votes for select to authenticated
  using (user_id = (select auth.uid()) or public.is_moderator());

create policy "Registered users can create their own vote"
  on public.community_post_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = 'registered_user'
    )
  );

create policy "Registered users can change their own vote"
  on public.community_post_votes for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = 'registered_user'
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = 'registered_user'
    )
  );

create policy "Registered users can remove their own vote"
  on public.community_post_votes for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = 'registered_user'
    )
  );

create policy "Anyone can read comments on community posts"
  on public.community_post_comments for select to anon, authenticated
  using (exists (
    select 1 from public.community_posts p where p.id = post_id
  ));

create policy "Registered users can comment as themselves"
  on public.community_post_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = 'registered_user'
    )
    and exists (
      select 1 from public.community_posts p where p.id = post_id
    )
  );
