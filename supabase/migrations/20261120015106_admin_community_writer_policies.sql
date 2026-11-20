-- Admins receive the same authenticated Community write paths as Registered
-- Users, without granting anonymous access or changing ownership checks.

DROP POLICY IF EXISTS "Admins can publish community posts"
  ON public.community_posts;
CREATE POLICY "Admins can publish community posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND NOT is_hidden
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(photo_paths) AS paths(photo_path)
      WHERE split_part(paths.photo_path, '/', 1) <>
        (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "Admins can comment as themselves"
  ON public.community_post_comments;
CREATE POLICY "Admins can comment as themselves"
  ON public.community_post_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
    AND EXISTS (
      SELECT 1
      FROM public.community_posts AS post
      WHERE post.id = post_id
        AND NOT post.is_hidden
    )
  );

DROP POLICY IF EXISTS "Admins can create their own community vote"
  ON public.community_post_votes;
CREATE POLICY "Admins can create their own community vote"
  ON public.community_post_votes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can change their own community vote"
  ON public.community_post_votes;
CREATE POLICY "Admins can change their own community vote"
  ON public.community_post_votes FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can remove their own community vote"
  ON public.community_post_votes;
CREATE POLICY "Admins can remove their own community vote"
  ON public.community_post_votes FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can upload their own Community photos"
  ON storage.objects;
CREATE POLICY "Admins can upload their own Community photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-post-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    )
  );