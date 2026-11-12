
-- =========================================================
-- QROUTE: LOGIN PROTECTION
-- =========================================================
-- Account protection:
--   3 consecutive failed passwords = 60-second cooldown
--
-- IP protection:
--   20 failed attempts within 15 minutes = 15-minute block
--
-- Deleted accounts:
--   profiles.is_deleted = true cannot log in
--
-- All tracking functions are restricted to service_role.
-- =========================================================


-- =========================================================
-- 1. ACCOUNT LOGIN ATTEMPTS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.login_attempts (
    user_id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    failed_attempts INTEGER NOT NULL DEFAULT 0
        CHECK (failed_attempts >= 0),

    locked_until TIMESTAMPTZ,

    last_failed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =========================================================
-- 2. IP LOGIN ATTEMPTS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.login_ip_attempts (
    ip_key TEXT PRIMARY KEY,

    failed_attempts INTEGER NOT NULL DEFAULT 0
        CHECK (failed_attempts >= 0),

    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    blocked_until TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =========================================================
-- 3. INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until
    ON public.login_attempts (locked_until);

CREATE INDEX IF NOT EXISTS idx_login_ip_attempts_blocked_until
    ON public.login_ip_attempts (blocked_until);


-- =========================================================
-- 4. ENABLE RLS
-- =========================================================

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_ip_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.login_attempts
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.login_ip_attempts
    FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.login_attempts TO service_role;
GRANT ALL ON TABLE public.login_ip_attempts TO service_role;


-- =========================================================
-- 5. RESOLVE EMAIL OR USERNAME TO AUTH ACCOUNT
-- =========================================================
-- This function:
--   - Accepts an email or username.
--   - Resolves the corresponding Auth UUID.
--   - Returns the account email.
--   - Returns profiles.is_deleted.
--   - Returns no account if the identifier is ambiguous.
--
-- It is only executable by service_role.

CREATE OR REPLACE FUNCTION public.resolve_login_account(
    p_identifier TEXT
)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    is_deleted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_identifier TEXT;
    v_match_count INTEGER;
BEGIN
    v_identifier := lower(trim(p_identifier));

    IF v_identifier IS NULL OR v_identifier = '' THEN
        RETURN;
    END IF;

    IF position('@' IN v_identifier) > 0 THEN

        SELECT count(*)
        INTO v_match_count
        FROM auth.users u
        INNER JOIN public.profiles p
            ON p.id = u.id
        WHERE lower(u.email) = v_identifier;

        IF v_match_count <> 1 THEN
            RETURN;
        END IF;

        RETURN QUERY
        SELECT
            u.id,
            u.email::TEXT,
            COALESCE(p.is_deleted, false)
        FROM auth.users u
        INNER JOIN public.profiles p
            ON p.id = u.id
        WHERE lower(u.email) = v_identifier;

    ELSE

        SELECT count(*)
        INTO v_match_count
        FROM public.profiles p
        INNER JOIN auth.users u
            ON u.id = p.id
        WHERE lower(p.username) = v_identifier;

        IF v_match_count <> 1 THEN
            RETURN;
        END IF;

        RETURN QUERY
        SELECT
            u.id,
            u.email::TEXT,
            COALESCE(p.is_deleted, false)
        FROM public.profiles p
        INNER JOIN auth.users u
            ON u.id = p.id
        WHERE lower(p.username) = v_identifier;

    END IF;
END;
$$;


-- =========================================================
-- 6. CHECK ACCOUNT AND IP RESTRICTIONS
-- =========================================================

CREATE OR REPLACE FUNCTION public.check_login_protection(
    p_user_id UUID,
    p_ip_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_account_locked_until TIMESTAMPTZ;
    v_ip_blocked_until TIMESTAMPTZ;
BEGIN

    IF p_user_id IS NOT NULL THEN
        SELECT la.locked_until
        INTO v_account_locked_until
        FROM public.login_attempts la
        WHERE la.user_id = p_user_id;

        IF v_account_locked_until > clock_timestamp() THEN
            RETURN jsonb_build_object(
                'blocked', true,
                'scope', 'account',
                'lockedUntil', v_account_locked_until
            );
        END IF;
    END IF;

    SELECT ia.blocked_until
    INTO v_ip_blocked_until
    FROM public.login_ip_attempts ia
    WHERE ia.ip_key = p_ip_key;

    IF v_ip_blocked_until > clock_timestamp() THEN
        RETURN jsonb_build_object(
            'blocked', true,
            'scope', 'ip',
            'lockedUntil', v_ip_blocked_until
        );
    END IF;

    RETURN jsonb_build_object(
        'blocked', false,
        'scope', NULL,
        'lockedUntil', NULL
    );
END;
$$;


-- =========================================================
-- 7. RECORD FAILED LOGIN ATTEMPT
-- =========================================================
-- Updates account and IP counters atomically.
-- Row locks prevent concurrent requests from losing increments.
--
-- p_user_id can be NULL for unknown identifiers.
-- Unknown accounts still contribute to IP protection.

CREATE OR REPLACE FUNCTION public.record_login_failure(
    p_user_id UUID,
    p_ip_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();

    v_account_count INTEGER;
    v_account_locked_until TIMESTAMPTZ;
    v_new_account_lock TIMESTAMPTZ;

    v_ip_count INTEGER;
    v_ip_window_started TIMESTAMPTZ;
    v_ip_blocked_until TIMESTAMPTZ;
    v_new_ip_block TIMESTAMPTZ;
BEGIN

    -- -----------------------------------------------------
    -- ACCOUNT COUNTER
    -- -----------------------------------------------------

    IF p_user_id IS NOT NULL THEN

        INSERT INTO public.login_attempts (
            user_id,
            failed_attempts,
            created_at,
            updated_at
        )
        VALUES (
            p_user_id,
            0,
            v_now,
            v_now
        )
        ON CONFLICT (user_id) DO NOTHING;

        SELECT
            failed_attempts,
            locked_until
        INTO
            v_account_count,
            v_account_locked_until
        FROM public.login_attempts
        WHERE user_id = p_user_id
        FOR UPDATE;

        IF v_account_locked_until > v_now THEN

            v_new_account_lock := v_account_locked_until;

        ELSE

            IF v_account_locked_until IS NOT NULL
               AND v_account_locked_until <= v_now THEN
                v_account_count := 0;
            END IF;

            v_account_count := v_account_count + 1;

            IF v_account_count >= 3 THEN
                v_new_account_lock := v_now + INTERVAL '60 seconds';
            ELSE
                v_new_account_lock := NULL;
            END IF;

            UPDATE public.login_attempts
            SET
                failed_attempts = v_account_count,
                locked_until = v_new_account_lock,
                last_failed_at = v_now,
                updated_at = v_now
            WHERE user_id = p_user_id;

        END IF;

    END IF;


    -- -----------------------------------------------------
    -- IP COUNTER
    -- -----------------------------------------------------

    INSERT INTO public.login_ip_attempts (
        ip_key,
        failed_attempts,
        window_started_at,
        created_at,
        updated_at
    )
    VALUES (
        p_ip_key,
        0,
        v_now,
        v_now,
        v_now
    )
    ON CONFLICT (ip_key) DO NOTHING;

    SELECT
        failed_attempts,
        window_started_at,
        blocked_until
    INTO
        v_ip_count,
        v_ip_window_started,
        v_ip_blocked_until
    FROM public.login_ip_attempts
    WHERE ip_key = p_ip_key
    FOR UPDATE;

    IF v_ip_blocked_until > v_now THEN

        v_new_ip_block := v_ip_blocked_until;

    ELSE

        IF (
            v_ip_blocked_until IS NOT NULL
            AND v_ip_blocked_until <= v_now
        ) OR (
            v_ip_window_started <= v_now - INTERVAL '15 minutes'
        ) THEN
            v_ip_count := 0;
            v_ip_window_started := v_now;
        END IF;

        v_ip_count := v_ip_count + 1;

        IF v_ip_count >= 20 THEN
            v_new_ip_block := v_now + INTERVAL '15 minutes';
        ELSE
            v_new_ip_block := NULL;
        END IF;

        UPDATE public.login_ip_attempts
        SET
            failed_attempts = v_ip_count,
            window_started_at = v_ip_window_started,
            blocked_until = v_new_ip_block,
            updated_at = v_now
        WHERE ip_key = p_ip_key;

    END IF;


    -- -----------------------------------------------------
    -- RETURN RESTRICTION INFORMATION
    -- -----------------------------------------------------

    RETURN jsonb_build_object(
        'accountLockedUntil', v_new_account_lock,
        'ipBlockedUntil', v_new_ip_block
    );

END;
$$;


-- =========================================================
-- 8. RESET ACCOUNT FAILURES AFTER SUCCESSFUL LOGIN
-- =========================================================
-- Does not reset the IP counter.

CREATE OR REPLACE FUNCTION public.reset_login_attempts(
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN

    DELETE FROM public.login_attempts
    WHERE user_id = p_user_id;

END;
$$;


-- =========================================================
-- 9. RESTRICT FUNCTION EXECUTION
-- =========================================================

REVOKE ALL ON FUNCTION public.resolve_login_account(TEXT)
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.check_login_protection(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.record_login_failure(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reset_login_attempts(UUID)
    FROM PUBLIC, anon, authenticated;


GRANT EXECUTE ON FUNCTION public.resolve_login_account(TEXT)
    TO service_role;

GRANT EXECUTE ON FUNCTION public.check_login_protection(UUID, TEXT)
    TO service_role;

GRANT EXECUTE ON FUNCTION public.record_login_failure(UUID, TEXT)
    TO service_role;

GRANT EXECUTE ON FUNCTION public.reset_login_attempts(UUID)
    TO service_role;


-- =========================================================
-- END OF MIGRATION
-- =========================================================
