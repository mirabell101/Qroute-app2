-- Public buckets permit object retrieval by URL; existing Storage policies
-- continue to control listing and all upload, update, and delete operations.
-- Verify the bucket contains only public profile photos before applying:
-- public access covers every object in the bucket.
DO $$
BEGIN
  UPDATE storage.buckets
  SET public = TRUE
  WHERE id = 'profile-photos';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected storage bucket profile-photos to exist';
  END IF;
END;
$$;