-- Expose only HTTPS Google photo URLs for authors of visible Community
-- posts/comments. The underlying Auth metadata remains private.
CREATE OR REPLACE FUNCTION public.get_public_community_author_google_photos()
RETURNS TABLE (
  author_id uuid,
  google_profile_photo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH public_data AS (
    SELECT public.get_public_community_data(
      NULL::uuid[],
      TRUE,
      TRUE
    ) AS data
  ),
  visible_author_ids AS (
    SELECT DISTINCT author_record.value ->> 'author_id' AS author_id
    FROM public_data
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      COALESCE(public_data.data -> 'posts', '[]'::jsonb)
      || COALESCE(public_data.data -> 'comments', '[]'::jsonb)
    ) AS author_record(value)
  )
  SELECT
    auth_user.id,
    auth_user.raw_user_meta_data ->> 'picture'
  FROM visible_author_ids
  JOIN auth.users AS auth_user
    ON auth_user.id::text = visible_author_ids.author_id
  WHERE (
      auth_user.raw_app_meta_data ->> 'provider' = 'google'
      OR COALESCE(
        auth_user.raw_app_meta_data -> 'providers',
        '[]'::jsonb
      ) ? 'google'
    )
    AND (
      auth_user.raw_user_meta_data ->> 'picture'
    ) ~ '^https://[^[:space:]]+$';
$$;

COMMENT ON FUNCTION public.get_public_community_author_google_photos() IS
  'Returns only HTTPS Google photo URLs for authors in visible Community posts and comments.';

REVOKE ALL ON FUNCTION public.get_public_community_author_google_photos()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_community_author_google_photos()
  TO anon;