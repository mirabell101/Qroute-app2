-- Read-only verification for route archive reinstatement.
SELECT
    to_regprocedure('public.get_route_archive_recovery_status()') IS NOT NULL
        AS status_function_exists,
    to_regprocedure('public.reinstate_archived_route(bigint)') IS NOT NULL
        AS reinstatement_function_exists,
    to_regprocedure('public.reconcile_restored_route_archive(bigint)') IS NOT NULL
        AS reconciliation_function_exists,
    has_function_privilege(
        'authenticated',
        'public.get_route_archive_recovery_status()',
        'EXECUTE'
    ) AS authenticated_can_call_status_rpc,
    has_function_privilege(
        'authenticated',
        'public.reinstate_archived_route(bigint)',
        'EXECUTE'
    ) AS authenticated_can_call_reinstatement_rpc,
    has_function_privilege(
        'authenticated',
        'public.reconcile_restored_route_archive(bigint)',
        'EXECUTE'
    ) AS authenticated_can_call_reconciliation_rpc,
    has_function_privilege(
        'anon',
        'public.get_route_archive_recovery_status()',
        'EXECUTE'
    ) AS anon_can_call_status_rpc,
    has_function_privilege(
        'anon',
        'public.reinstate_archived_route(bigint)',
        'EXECUTE'
    ) AS anon_can_call_reinstatement_rpc,
    has_function_privilege(
        'anon',
        'public.reconcile_restored_route_archive(bigint)',
        'EXECUTE'
    ) AS anon_can_call_reconciliation_rpc,
    (
        SELECT prosecdef
        FROM pg_catalog.pg_proc
        WHERE oid = 'public.get_route_archive_recovery_status()'::regprocedure
    ) AS status_rpc_security_definer,
    (
        SELECT prosecdef
        FROM pg_catalog.pg_proc
        WHERE oid = 'public.reinstate_archived_route(bigint)'::regprocedure
    ) AS reinstatement_rpc_security_definer,
    (
        SELECT prosecdef
        FROM pg_catalog.pg_proc
        WHERE oid = 'public.reconcile_restored_route_archive(bigint)'::regprocedure
    ) AS reconciliation_rpc_security_definer,
    (
        SELECT proconfig
        FROM pg_catalog.pg_proc
        WHERE oid = 'public.reinstate_archived_route(bigint)'::regprocedure
    ) AS reinstatement_rpc_settings;

-- Run as an administrator in the SQL editor with an authenticated session
-- context only if your SQL editor supports auth.uid(). The API will call this
-- RPC through the user's bearer token and enforce the admin role in SQL.
-- SELECT public.get_route_archive_recovery_status();

-- Do not test the mutation RPC directly in SQL Editor. Test through the
-- authenticated Route Management API after installing the backend package.
