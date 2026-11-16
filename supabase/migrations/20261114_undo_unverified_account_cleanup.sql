
BEGIN;

-- ============================================================
-- 1. REMOVE THE AUTH USER CLEANUP TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS trg_cleanup_unverified_email_user
ON auth.users;


-- ============================================================
-- 2. REMOVE THE CLEANUP FUNCTION
-- ============================================================

DROP FUNCTION IF EXISTS
    public.cleanup_unverified_email_user_before_delete();


-- ============================================================
-- 3. RESTORE THE HISTORICAL COMMUNITY FOREIGN KEYS
-- ============================================================

ALTER TABLE public.community_posts
    ADD CONSTRAINT community_posts_author_id_fkey
    FOREIGN KEY (author_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
    NOT VALID;


ALTER TABLE public.community_post_comments
    ADD CONSTRAINT community_post_comments_author_id_fkey
    FOREIGN KEY (author_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
    NOT VALID;


-- ============================================================
-- 4. RESTORE THE USER MODERATION FOREIGN KEY
-- ============================================================

ALTER TABLE public.user_moderation
    ADD CONSTRAINT user_moderation_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
    NOT VALID;


COMMIT;
