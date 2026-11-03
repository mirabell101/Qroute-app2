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
