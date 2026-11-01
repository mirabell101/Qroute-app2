create or replace function public.set_community_vote(
  p_post_id uuid,
  p_vote_type text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.community_post_votes (post_id, user_id, vote_type)
  values (p_post_id, (select auth.uid()), p_vote_type)
  on conflict (post_id, user_id)
  do update set vote_type = excluded.vote_type;
$$;

revoke all on function public.set_community_vote(uuid, text) from public, anon, authenticated;
grant execute on function public.set_community_vote(uuid, text) to authenticated;
