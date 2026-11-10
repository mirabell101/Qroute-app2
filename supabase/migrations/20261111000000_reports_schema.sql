-- Reports schema for QRoute community and user reports
CREATE TABLE IF NOT EXISTS public.reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('Post', 'User', 'Route', 'General')),
  reason text NOT NULL,
  reported_content text NOT NULL,
  reporter text NOT NULL DEFAULT 'anonymous',
  reported_user text NOT NULL DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Reviewed', 'Dismissed')),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Registered users can submit reports
CREATE POLICY "authenticated_insert_reports" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admins and moderators can read all reports
CREATE POLICY "admin_select_reports" ON public.reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Admins and moderators can update reports (e.g. status)
CREATE POLICY "admin_update_reports" ON public.reports
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Seed initial report records if table is empty
INSERT INTO public.reports (type, reason, reported_content, reporter, reported_user, status, description, created_at)
SELECT 'Post', 'Incorrect fare information', 'Fare update for Cubao - Fairview', 'commuter01', 'sample_user1', 'Pending', 'The fare information in this community post may be inaccurate. Please verify the reported details.', now() - interval '2 days'
WHERE NOT EXISTS (SELECT 1 FROM public.reports);

INSERT INTO public.reports (type, reason, reported_content, reporter, reported_user, status, description, created_at)
SELECT 'User', 'Inappropriate behavior', '@sample_user2', 'qroute_member', 'sample_user2', 'Pending', 'This user was reported for behavior that may violate the QRoute community guidelines.', now() - interval '1 day'
WHERE (SELECT count(*) FROM public.reports) = 1;

INSERT INTO public.reports (type, reason, reported_content, reporter, reported_user, status, description, created_at)
SELECT 'Post', 'Misleading information', 'Jeepney route update', 'commuter03', 'sample_user3', 'Reviewed', 'A community member questioned the accuracy of the route information shared in this post.', now() - interval '3 days'
WHERE (SELECT count(*) FROM public.reports) = 2;

INSERT INTO public.reports (type, reason, reported_content, reporter, reported_user, status, description, created_at)
SELECT 'Post', 'Spam', 'Repeated transportation post', 'sample_user4', 'sample_user4', 'Dismissed', 'The report was reviewed and dismissed because the available information did not establish a violation.', now() - interval '5 days'
WHERE (SELECT count(*) FROM public.reports) = 3;
