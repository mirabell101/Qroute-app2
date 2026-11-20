-- Public author IDs permit Visitors to request only their corresponding
-- private profile-photo object signatures. No private profile fields are returned.
-- This migration is local-only and must not be pushed or applied without approval.
CREATE OR REPLACE FUNCTION public.get_public_community_data(
  p_post_ids uuid[] DEFAULT NULL,
  p_include_posts boolean DEFAULT TRUE,
  p_include_comments boolean DEFAULT TRUE
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidate_posts AS (
    SELECT
      p.id,
      p.author_id,
      EXISTS (
        SELECT 1
        FROM public.user_roles AS author_role
        WHERE author_role.user_id = p.author_id
          AND author_role.role = 'admin'
      ) AS author_is_admin,
      p.author_display_name,
      p.title,
      p.content,
      p.start_name,
      p.start_latitude,
      p.start_longitude,
      p.destination_name,
      p.destination_latitude,
      p.destination_longitude,
      p.transport_type_id,
      p.photo_paths,
      tt.name AS transport_type,
      p.created_at,
      (
        SELECT count(*)::integer
        FROM public.community_post_comments AS comment_count
        WHERE comment_count.post_id = p.id
      ) AS comment_count,
      (
        SELECT count(*)::integer
        FROM public.community_post_votes AS vote
        WHERE vote.post_id = p.id AND vote.vote_type = 'upvote'
      ) AS upvotes,
      (
        SELECT count(*)::integer
        FROM public.community_post_votes AS vote
        WHERE vote.post_id = p.id AND vote.vote_type = 'downvote'
      ) AS downvotes
    FROM public.community_posts AS p
    LEFT JOIN public.transport_types AS tt ON tt.id = p.transport_type_id
    WHERE NOT p.is_hidden
      AND (
        (p_post_ids IS NULL AND p_include_posts)
        OR (p_post_ids IS NOT NULL AND p.id = ANY (p_post_ids))
      )
    ORDER BY p.created_at DESC
    LIMIT 100
  ),
  public_posts AS (
    SELECT * FROM candidate_posts WHERE p_include_posts
  ),
  public_comments AS (
    SELECT
      comment.id,
      comment.post_id,
      comment.author_id,
      EXISTS (
        SELECT 1
        FROM public.user_roles AS author_role
        WHERE author_role.user_id = comment.author_id
          AND author_role.role = 'admin'
      ) AS author_is_admin,
      comment.author_display_name,
      comment.content,
      comment.created_at
    FROM public.community_post_comments AS comment
    JOIN candidate_posts AS post ON post.id = comment.post_id
    WHERE p_include_comments
    ORDER BY comment.created_at ASC
  )
  SELECT pg_catalog.jsonb_build_object(
    'posts', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', post.id,
            'author_id', post.author_id,
            'author_is_admin', post.author_is_admin,
            'author_display_name', post.author_display_name,
            'title', post.title,
            'content', post.content,
            'start_name', post.start_name,
            'start_latitude', post.start_latitude,
            'start_longitude', post.start_longitude,
            'destination_name', post.destination_name,
            'destination_latitude', post.destination_latitude,
            'destination_longitude', post.destination_longitude,
            'transport_type_id', post.transport_type_id,
            'transport_type', post.transport_type,
            'photo_paths', pg_catalog.to_jsonb(post.photo_paths),
            'created_at', post.created_at,
            'comment_count', post.comment_count,
            'upvotes', post.upvotes,
            'downvotes', post.downvotes
          ) ORDER BY post.created_at DESC
        )
        FROM public_posts AS post
      ),
      '[]'::jsonb
    ),
    'comments', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', comment.id,
            'post_id', comment.post_id,
            'author_id', comment.author_id,
            'author_is_admin', comment.author_is_admin,
            'author_display_name', comment.author_display_name,
            'content', comment.content,
            'created_at', comment.created_at
          ) ORDER BY comment.created_at ASC
        )
        FROM public_comments AS comment
      ),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.get_public_community_data(uuid[], boolean, boolean) IS
  'Returns public Community display fields, public author IDs, and a display-only Admin marker to anonymous visitors; it excludes hidden posts and private profile fields.';

REVOKE ALL ON FUNCTION public.get_public_community_data(uuid[], boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_community_data(uuid[], boolean, boolean)
  TO anon;

DROP POLICY IF EXISTS "Anonymous users can sign visible Community author photos"
  ON storage.objects;

CREATE POLICY "Anonymous users can sign visible Community author photos"
  ON storage.objects FOR SELECT TO anon
  USING (
    storage.allow_only_operation('storage.object.sign_many')
    AND bucket_id = 'profile-photos'
    AND storage.objects.name = (
      (storage.foldername(storage.objects.name))[1] || '/profile'
    )
    AND EXISTS (
      SELECT 1
      FROM public.get_public_community_data(NULL, TRUE, TRUE)
        AS public_data(data)
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        COALESCE(public_data.data -> 'posts', '[]'::jsonb)
        || COALESCE(public_data.data -> 'comments', '[]'::jsonb)
      ) AS author_record(value)
      WHERE author_record.value ->> 'author_id' =
        (storage.foldername(storage.objects.name))[1]
    )
  );
