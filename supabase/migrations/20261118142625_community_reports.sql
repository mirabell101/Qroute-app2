CREATE TABLE public.community_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporter_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL
    CHECK (target_type IN ('post', 'comment', 'user')),
  post_id uuid
    REFERENCES public.community_posts(id) ON DELETE SET NULL,
  comment_id uuid
    REFERENCES public.community_post_comments(id) ON DELETE SET NULL,
  reported_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_user_name text NOT NULL
    CHECK (char_length(btrim(reported_user_name)) BETWEEN 1 AND 120),
  reported_content text NOT NULL
    CHECK (char_length(btrim(reported_content)) BETWEEN 1 AND 5000),
  reason text NOT NULL CHECK (
    reason IN (
      'Spam or misleading content',
      'Harassment or bullying',
      'Hate speech or discrimination',
      'Inappropriate or offensive content',
      'False or misleading information',
      'Threats or violence',
      'Privacy violation',
      'Other'
    )
  ),
  description text CHECK (
    description IS NULL OR char_length(description) <= 2000
  ),
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Reviewed', 'Dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_reports_target_context_check CHECK (
    (target_type <> 'post' OR comment_id IS NULL)
    AND (
      comment_id IS NULL
      OR (target_type IN ('comment', 'user') AND post_id IS NOT NULL)
    )
  ),
  CONSTRAINT community_reports_other_description_check CHECK (
    reason <> 'Other' OR nullif(btrim(description), '') IS NOT NULL
  )
);

CREATE INDEX community_reports_reporter_id_idx
  ON public.community_reports (reporter_id);
CREATE INDEX community_reports_post_id_idx
  ON public.community_reports (post_id);
CREATE INDEX community_reports_comment_id_idx
  ON public.community_reports (comment_id);
CREATE INDEX community_reports_reported_user_id_idx
  ON public.community_reports (reported_user_id);

CREATE UNIQUE INDEX community_reports_post_reporter_key
  ON public.community_reports (reporter_id, post_id)
  WHERE target_type = 'post' AND post_id IS NOT NULL;
CREATE UNIQUE INDEX community_reports_comment_reporter_key
  ON public.community_reports (reporter_id, comment_id)
  WHERE target_type = 'comment' AND comment_id IS NOT NULL;
CREATE UNIQUE INDEX community_reports_user_reporter_key
  ON public.community_reports (reporter_id, reported_user_id)
  WHERE target_type = 'user' AND reported_user_id IS NOT NULL;

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.community_reports
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.community_reports TO authenticated;
GRANT INSERT (
  target_type,
  post_id,
  comment_id,
  reported_user_id,
  reported_user_name,
  reported_content,
  reason,
  description
) ON TABLE public.community_reports TO authenticated;
GRANT UPDATE (status, updated_at)
  ON TABLE public.community_reports TO authenticated;
GRANT USAGE ON SEQUENCE public.community_reports_id_seq TO authenticated;

CREATE POLICY "Registered users can submit validated community reports"
  ON public.community_reports FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND status = 'Pending'
    AND reported_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'registered_user'
    )
    AND (
      (
        target_type = 'post'
        AND comment_id IS NULL
        AND post_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.community_posts AS post
          WHERE post.id = community_reports.post_id
            AND post.is_hidden = false
            AND post.author_id = community_reports.reported_user_id
            AND post.author_id <> (SELECT auth.uid())
            AND post.author_display_name = community_reports.reported_user_name
            AND post.content = community_reports.reported_content
        )
      )
      OR (
        target_type = 'comment'
        AND post_id IS NOT NULL
        AND comment_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.community_post_comments AS comment
          JOIN public.community_posts AS post
            ON post.id = comment.post_id
          WHERE comment.id = community_reports.comment_id
            AND comment.post_id = community_reports.post_id
            AND post.is_hidden = false
            AND comment.author_id = community_reports.reported_user_id
            AND comment.author_id <> (SELECT auth.uid())
            AND comment.author_display_name = community_reports.reported_user_name
            AND comment.content = community_reports.reported_content
        )
      )
      OR (
        target_type = 'user'
        AND (
          (
            comment_id IS NULL
            AND post_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.community_posts AS post
              WHERE post.id = community_reports.post_id
                AND post.is_hidden = false
                AND post.author_id = community_reports.reported_user_id
                AND post.author_id <> (SELECT auth.uid())
                AND post.author_display_name = community_reports.reported_user_name
                AND post.content = community_reports.reported_content
            )
          )
          OR (
            comment_id IS NOT NULL
            AND post_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.community_post_comments AS comment
              JOIN public.community_posts AS post
                ON post.id = comment.post_id
              WHERE comment.id = community_reports.comment_id
                AND comment.post_id = community_reports.post_id
                AND post.is_hidden = false
                AND comment.author_id = community_reports.reported_user_id
                AND comment.author_id <> (SELECT auth.uid())
                AND comment.author_display_name = community_reports.reported_user_name
                AND comment.content = community_reports.reported_content
            )
          )
        )
      )
    )
  );

CREATE POLICY "Reporters and admins can read community reports"
  ON public.community_reports FOR SELECT TO authenticated
  USING (
    reporter_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );

CREATE POLICY "Admins can update community report status"
  ON public.community_reports FOR UPDATE TO authenticated
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