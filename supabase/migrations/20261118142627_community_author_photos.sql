CREATE POLICY "Registered users can sign visible Community author photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    storage.allow_only_operation('storage.object.sign_many')
    AND bucket_id = 'profile-photos'
    AND storage.objects.name = (
      (storage.foldername(storage.objects.name))[1] || '/profile'
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'registered_user'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.community_posts AS post
        WHERE post.author_id::text =
          (storage.foldername(storage.objects.name))[1]
          AND post.is_hidden = false
      )
      OR EXISTS (
        SELECT 1
        FROM public.community_post_comments AS comment
        JOIN public.community_posts AS post
          ON post.id = comment.post_id
        WHERE comment.author_id::text =
          (storage.foldername(storage.objects.name))[1]
          AND post.is_hidden = false
      )
    )
  );