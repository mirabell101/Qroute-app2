create policy "Community members can receive Community broadcasts"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'community:feed'
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('registered_user', 'admin')
    )
  );

create or replace function public.broadcast_community_vote_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_post_id uuid;
begin
  if tg_op = 'DELETE' then
    affected_post_id := old.post_id;
  else
    affected_post_id := new.post_id;
  end if;

  perform realtime.send(
    jsonb_build_object('post_id', affected_post_id),
    'vote_changed',
    'community:feed',
    true
  );
  return null;
end;
$$;

create or replace function public.broadcast_community_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'post_id', new.post_id,
      'author_display_name', new.author_display_name,
      'content', new.content,
      'created_at', new.created_at
    ),
    'comment_created',
    'community:feed',
    true
  );
  return null;
end;
$$;

revoke all on function public.broadcast_community_vote_change() from public, anon, authenticated;
revoke all on function public.broadcast_community_comment() from public, anon, authenticated;

create trigger community_votes_broadcast_change
  after insert or update or delete on public.community_post_votes
  for each row execute function public.broadcast_community_vote_change();

create trigger community_comments_broadcast_insert
  after insert on public.community_post_comments
  for each row execute function public.broadcast_community_comment();
