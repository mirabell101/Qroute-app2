alter table public.community_post_votes
  drop constraint community_post_votes_post_user_key,
  add constraint community_post_votes_pkey primary key (post_id, user_id);

create index community_post_votes_user_id_idx
  on public.community_post_votes (user_id);

create index community_post_comments_author_id_idx
  on public.community_post_comments (author_id);

create index community_posts_transport_type_id_idx
  on public.community_posts (transport_type_id);
