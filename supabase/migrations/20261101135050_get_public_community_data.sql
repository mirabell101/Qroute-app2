-- Anonymous Community reads use a narrow public RPC instead of direct
-- access to posts, comments, or individual vote rows. Community posts are
-- published immediately; the schema has no Contributions approval state.
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
    WHERE
      (p_post_ids IS NULL AND p_include_posts)
      OR (p_post_ids IS NOT NULL AND p.id = ANY (p_post_ids))
    ORDER BY p.created_at DESC
    LIMIT 100
  ),
  public_posts AS (
    SELECT * FROM candidate_posts WHERE p_include_posts
  ),
  public_comments AS (
    SELECT
      c.id,
      c.post_id,
      c.author_display_name,
      c.content,
      c.created_at
    FROM public.community_post_comments AS c
    JOIN candidate_posts AS p ON p.id = c.post_id
    WHERE p_include_comments
    ORDER BY c.created_at ASC
  )
  SELECT pg_catalog.jsonb_build_object(
    'posts', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', p.id,
            'author_display_name', p.author_display_name,
            'title', p.title,
            'content', p.content,
            'start_name', p.start_name,
            'start_latitude', p.start_latitude,
            'start_longitude', p.start_longitude,
            'destination_name', p.destination_name,
            'destination_latitude', p.destination_latitude,
            'destination_longitude', p.destination_longitude,
            'transport_type_id', p.transport_type_id,
            'transport_type', p.transport_type,
            'photo_paths', '[]'::jsonb,
            'created_at', p.created_at,
            'comment_count', p.comment_count,
            'upvotes', p.upvotes,
            'downvotes', p.downvotes
          ) ORDER BY p.created_at DESC
        )
        FROM public_posts AS p
      ),
      '[]'::jsonb
    ),
    'comments', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', c.id,
            'post_id', c.post_id,
            'author_display_name', c.author_display_name,
            'content', c.content,
            'created_at', c.created_at
          ) ORDER BY c.created_at ASC
        )
        FROM public_comments AS c
      ),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.get_public_community_data(uuid[], boolean, boolean) IS
  'Returns only public Community display fields and aggregate vote counts to anonymous visitors. It does not require Contributions approval, expose account IDs or voter rows, or return moderation data.';

-- Remove only the anonymous read privileges that the public RPC replaces.
-- Authenticated grants and all Community RLS policies remain unchanged.
REVOKE SELECT ON TABLE public.community_posts FROM anon;
REVOKE SELECT ON TABLE public.community_post_comments FROM anon;
REVOKE SELECT ON TABLE public.community_post_votes FROM anon;
REVOKE SELECT (post_id, vote_type) ON TABLE public.community_post_votes FROM anon;

-- Functions grant EXECUTE to PUBLIC by default; explicitly allow only anon.
REVOKE ALL ON FUNCTION public.get_public_community_data(uuid[], boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_community_data(uuid[], boolean, boolean)
  TO anon;
