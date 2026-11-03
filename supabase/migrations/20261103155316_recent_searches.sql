CREATE TABLE public.recent_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  item_type text NOT NULL
    CHECK (item_type IN ('route', 'stop', 'terminal')),
  item_id bigint NOT NULL CHECK (item_id > 0),
  last_searched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recent_searches_user_item_key
    UNIQUE (user_id, item_type, item_id)
);

ALTER TABLE public.recent_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY recent_searches_select_own
  ON public.recent_searches FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY recent_searches_insert_own
  ON public.recent_searches FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY recent_searches_update_own
  ON public.recent_searches FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY recent_searches_delete_own
  ON public.recent_searches FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL PRIVILEGES ON TABLE public.recent_searches
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recent_searches
  TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_recent_searches(p_entries jsonb)
RETURNS SETOF public.recent_searches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_entries IS NULL OR pg_catalog.jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Recent searches must be an array'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  WITH raw_entries AS (
    SELECT value
    FROM pg_catalog.jsonb_array_elements(p_entries) AS entry(value)
    WHERE pg_catalog.jsonb_typeof(value) = 'object'
  ),
  parsed_entries AS (
    SELECT
      value ->> 'item_type' AS item_type,
      CASE
        WHEN pg_catalog.jsonb_typeof(value -> 'item_id') = 'number'
          AND value ->> 'item_id' ~ '^[1-9][0-9]{0,15}$'
        THEN (value ->> 'item_id')::bigint
      END AS item_id,
      CASE
        WHEN pg_catalog.jsonb_typeof(value -> 'last_searched_at') = 'string'
        THEN (value ->> 'last_searched_at')::timestamptz
      END AS last_searched_at
    FROM raw_entries
    WHERE pg_catalog.jsonb_typeof(value -> 'item_type') = 'string'
  ),
  valid_entries AS (
    SELECT item_type, item_id, last_searched_at
    FROM parsed_entries
    WHERE item_type IN ('route', 'stop', 'terminal')
      AND item_id BETWEEN 1 AND 9007199254740991
      AND last_searched_at >= v_now - INTERVAL '30 days'
      AND last_searched_at <= v_now
  ),
  newest_entries AS (
    SELECT DISTINCT ON (item_type, item_id)
      item_type, item_id, last_searched_at
    FROM valid_entries
    ORDER BY item_type, item_id, last_searched_at DESC
  )
  INSERT INTO public.recent_searches AS existing (
    user_id, item_type, item_id, last_searched_at
  )
  SELECT v_user_id, item_type, item_id, last_searched_at
  FROM newest_entries
  ON CONFLICT (user_id, item_type, item_id) DO UPDATE
    SET last_searched_at = GREATEST(
      existing.last_searched_at,
      EXCLUDED.last_searched_at
    );

  DELETE FROM public.recent_searches
  WHERE user_id = v_user_id
    AND last_searched_at < v_now - INTERVAL '30 days';

  WITH ranked_entries AS (
    SELECT id,
      row_number() OVER (
        ORDER BY last_searched_at DESC, item_type, item_id
      ) AS position
    FROM public.recent_searches
    WHERE user_id = v_user_id
  )
  DELETE FROM public.recent_searches AS recent
  USING ranked_entries
  WHERE recent.id = ranked_entries.id
    AND ranked_entries.position > 25;

  RETURN QUERY
  SELECT *
  FROM public.recent_searches
  WHERE user_id = v_user_id
  ORDER BY last_searched_at DESC, item_type, item_id;
END;
$function$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.merge_recent_searches(jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.merge_recent_searches(jsonb)
  TO authenticated;

COMMENT ON TABLE public.recent_searches IS
  'Private recent searches. RLS limits each account to its own rows.';
