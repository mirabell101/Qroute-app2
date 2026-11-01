-- Author names are snapshots from the signed-in user's own profile; clients
-- cannot submit an arbitrary public author label.
create or replace function public.set_community_post_author_name()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  select left(coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'QRoute user'), 120)
    into new.author_display_name
  from public.profiles p
  where p.id = new.author_id;
  if not found then
    new.author_display_name := 'QRoute user';
  end if;
  return new;
end;
$$;

create trigger community_posts_set_author_name
before insert on public.community_posts
for each row execute function public.set_community_post_author_name();

create or replace function public.set_community_comment_author_name()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  select left(coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'QRoute user'), 120)
    into new.author_display_name
  from public.profiles p
  where p.id = new.author_id;
  if not found then
    new.author_display_name := 'QRoute user';
  end if;
  return new;
end;
$$;

create trigger community_comments_set_author_name
before insert on public.community_post_comments
for each row execute function public.set_community_comment_author_name();

revoke all on function public.set_community_post_author_name() from public, anon, authenticated;
revoke all on function public.set_community_comment_author_name() from public, anon, authenticated;

revoke insert on public.community_posts from authenticated;
grant insert (author_id, title, content, start_name, start_latitude, start_longitude,
  destination_name, destination_latitude, destination_longitude, transport_type_id)
  on public.community_posts to authenticated;

revoke insert on public.community_post_comments from authenticated;
revoke insert (author_display_name) on public.community_post_comments from authenticated;
grant insert (post_id, author_id, content)
  on public.community_post_comments to authenticated;
revoke insert (author_display_name) on public.community_posts from authenticated;
