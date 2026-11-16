
BEGIN;

-- ============================================================
-- 1. PRESERVE HISTORICAL COMMUNITY AND MODERATION RECORDS
-- ============================================================

-- Community posts must survive deletion of their authors.
ALTER TABLE public.community_posts
    DROP CONSTRAINT IF EXISTS community_posts_author_id_fkey;

-- Community comments must survive deletion of their authors.
ALTER TABLE public.community_post_comments
    DROP CONSTRAINT IF EXISTS community_post_comments_author_id_fkey;

-- Moderation history must survive deletion of the affected account.
ALTER TABLE public.user_moderation
    DROP CONSTRAINT IF EXISTS user_moderation_user_id_fkey;


-- ============================================================
-- 2. CREATE THE ACCOUNT CLEANUP FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_unverified_email_user_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN

    -- --------------------------------------------------------
    -- SAFETY CHECK 1: Only unverified email accounts.
    -- --------------------------------------------------------

    IF OLD.email_confirmed_at IS NOT NULL THEN
        RETURN OLD;
    END IF;

    -- --------------------------------------------------------
    -- SAFETY CHECK 2: Account must be older than 24 hours.
    -- --------------------------------------------------------

    IF OLD.created_at >= now() - INTERVAL '24 hours' THEN
        RETURN OLD;
    END IF;

    -- --------------------------------------------------------
    -- SAFETY CHECK 3: Never process SSO accounts.
    -- Uses JSON to avoid depending on a direct column reference.
    -- --------------------------------------------------------

    IF COALESCE(
        (pg_catalog.to_jsonb(OLD)->>'is_sso_user')::boolean,
        false
    ) THEN
        RETURN OLD;
    END IF;

    -- --------------------------------------------------------
    -- SAFETY CHECK 4: Only email as the primary provider.
    -- --------------------------------------------------------

    IF OLD.raw_app_meta_data->>'provider' IS DISTINCT FROM 'email' THEN
        RETURN OLD;
    END IF;

    -- --------------------------------------------------------
    -- SAFETY CHECK 5: Only email in the provider list.
    -- Reject Google, other OAuth providers, and mixed accounts.
    -- --------------------------------------------------------

    IF OLD.raw_app_meta_data->'providers'
        IS DISTINCT FROM '["email"]'::jsonb THEN
        RETURN OLD;
    END IF;

    -- --------------------------------------------------------
    -- SAFETY CHECK 6: Verify actual Auth identity records.
    -- Require an email identity and reject other providers.
    -- --------------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM auth.identities AS i
        WHERE i.user_id = OLD.id
          AND i.provider = 'email'
    ) THEN
        RETURN OLD;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM auth.identities AS i
        WHERE i.user_id = OLD.id
          AND i.provider <> 'email'
    ) THEN
        RETURN OLD;
    END IF;


    -- ========================================================
    -- 3. QUARANTINE PENDING ROUTES
    -- ========================================================

    UPDATE public.routes
    SET
        is_active = false,
        is_deleted = true,
        deleted_at = COALESCE(deleted_at, now()),
        deleted_by = NULL
    WHERE created_by = OLD.id
      AND moderation_status = 'pending'
      AND is_approved = false
      AND is_deleted = false;


    -- ========================================================
    -- 4. QUARANTINE PENDING STOPS
    -- ========================================================

    UPDATE public.stops
    SET
        is_active = false,
        is_deleted = true,
        deleted_at = COALESCE(deleted_at, now()),
        deleted_by = NULL
    WHERE created_by = OLD.id
      AND moderation_status = 'pending'
      AND is_approved = false
      AND is_deleted = false;


    -- ========================================================
    -- 5. QUARANTINE PENDING TERMINALS
    -- ========================================================

    UPDATE public.terminals
    SET
        is_active = false,
        is_deleted = true,
        deleted_at = COALESCE(deleted_at, now()),
        deleted_by = NULL
    WHERE created_by = OLD.id
      AND moderation_status = 'pending'
      AND is_approved = false
      AND is_deleted = false;


    -- ========================================================
    -- 6. SOFT-DELETE PENDING MAP IMAGE RECORDS
    -- ========================================================

    UPDATE public.map_images
    SET
        is_deleted = true,
        deleted_at = COALESCE(deleted_at, now()),
        deleted_by = NULL
    WHERE created_by = OLD.id
      AND moderation_status = 'pending'
      AND is_approved = false
      AND is_deleted = false;


    -- ========================================================
    -- 7. REMOVE PENDING MODERATION QUEUE ENTRIES
    -- ========================================================

    DELETE FROM public.moderation_queue
    WHERE created_by = OLD.id
      AND moderation_status = 'pending';


    -- ========================================================
    -- 8. ALLOW AUTH ACCOUNT DELETION TO CONTINUE
    -- ========================================================

    RETURN OLD;

END;
$function$;


-- ============================================================
-- 9. INSTALL THE AUTH USER DELETION TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS trg_cleanup_unverified_email_user
ON auth.users;

CREATE TRIGGER trg_cleanup_unverified_email_user
BEFORE DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_unverified_email_user_before_delete();


COMMIT;
