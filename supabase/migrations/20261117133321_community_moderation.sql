ALTER TABLE public.reports
  ADD COLUMN community_post_id uuid
    REFERENCES public.community_posts(id) ON DELETE SET NULL,
  ADD COLUMN reporter_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX reports_community_post_reporter_key
  ON public.reports (community_post_id, reporter_user_id)
  WHERE community_post_id IS NOT NULL AND reporter_user_id IS NOT NULL;
CREATE INDEX reports_community_post_pending_reporters_idx
  ON public.reports (community_post_id, reporter_user_id)
  WHERE status = 'Pending'
    AND community_post_id IS NOT NULL
    AND reporter_user_id IS NOT NULL;

ALTER TABLE public.community_posts
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX community_posts_photo_paths_gin_idx
  ON public.community_posts USING gin (photo_paths);

CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE,
  report_id bigint REFERENCES public.reports(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_notification_reads (
  notification_id uuid NOT NULL
    REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, admin_user_id)
);

CREATE INDEX admin_notifications_created_at_idx
  ON public.admin_notifications (created_at DESC);
CREATE INDEX admin_notification_reads_admin_user_idx
  ON public.admin_notification_reads (admin_user_id, notification_id);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.admin_notification_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_notifications TO authenticated;
GRANT SELECT, INSERT ON TABLE public.admin_notification_reads TO authenticated;

CREATE POLICY "Admins can read notification events"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );

CREATE POLICY "Admins can read their own notification receipts"
  ON public.admin_notification_reads FOR SELECT TO authenticated
  USING (
    admin_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );

CREATE POLICY "Admins can create their own notification receipts"
  ON public.admin_notification_reads FOR INSERT TO authenticated
  WITH CHECK (
    admin_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_insert_reports" ON public.reports;
CREATE POLICY "authenticated_insert_reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    community_post_id IS NULL
    AND reporter_user_id IS NULL
  );

DROP POLICY IF EXISTS "Anyone can read community posts"
  ON public.community_posts;
CREATE POLICY "Anyone can read visible community posts"
  ON public.community_posts FOR SELECT TO anon
  USING (NOT is_hidden);

CREATE POLICY "Authenticated users can read visible posts and admins can read hidden posts"
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    NOT is_hidden
    OR EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Registered users can publish community posts"
  ON public.community_posts;
CREATE POLICY "Registered users can publish community posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    NOT is_hidden
    AND author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'registered_user'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(photo_paths) AS paths(photo_path)
      WHERE split_part(paths.photo_path, '/', 1) <> (SELECT auth.uid())::text
    )
  );

GRANT UPDATE (is_hidden) ON public.community_posts TO authenticated;
CREATE POLICY "Admins can change community post visibility"
  ON public.community_posts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Registered users can read their own community photos"
  ON storage.objects;
CREATE POLICY "Users can read community photos for visible posts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'community-post-photos'
    AND EXISTS (
      SELECT 1
      FROM public.community_posts AS post
      WHERE post.photo_paths @> ARRAY[storage.objects.name]::text[]
    )
  );

UPDATE storage.buckets
SET public = false
WHERE id = 'community-post-photos';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'community-post-photos'
      AND public = false
  ) THEN
    RAISE EXCEPTION
      'Expected existing community-post-photos bucket; migration did not make it private.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_community_post_review_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  pending_reporters integer;
  post_author_name text;
BEGIN
  IF NEW.community_post_id IS NULL
    OR NEW.reporter_user_id IS NULL
    OR NEW.status <> 'Pending'
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.community_post_id::text, 0)
  );

  SELECT count(DISTINCT report.reporter_user_id)::integer
  INTO pending_reporters
  FROM public.reports AS report
  WHERE report.community_post_id = NEW.community_post_id
    AND report.reporter_user_id IS NOT NULL
    AND report.status = 'Pending';

  IF pending_reporters < 3 THEN
    RETURN NEW;
  END IF;

  SELECT post.author_display_name
  INTO post_author_name
  FROM public.community_posts AS post
  WHERE post.id = NEW.community_post_id;

  INSERT INTO public.admin_notifications (
    post_id,
    report_id,
    title,
    message
  )
  VALUES (
    NEW.community_post_id,
    NEW.id,
    'Post Needs Review',
    pg_catalog.format(
      '%s''s post has reached the report threshold and requires admin review.',
      post_author_name
    )
  )
  ON CONFLICT (post_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER community_post_report_review_notification
  AFTER INSERT OR UPDATE OF status, community_post_id
  ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.create_community_post_review_notification();

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
  'Returns public Community fields and photo paths for visible posts only, plus comments and vote aggregates. Hidden posts and their media are omitted.';