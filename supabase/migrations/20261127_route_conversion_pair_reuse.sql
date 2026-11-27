BEGIN;

-- Serialize this migration with the existing route-management mutation lock.
SELECT pg_catalog.pg_advisory_xact_lock(913713, 42001);

-- -----------------------------------------------------------------------------
-- 1. Durable one-to-one pairing between the original stop and terminal rows.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.route_conversion_pairs (
  stop_id bigint PRIMARY KEY
    REFERENCES public.stops(id) ON DELETE RESTRICT,
  terminal_id bigint NOT NULL UNIQUE
    REFERENCES public.terminals(id) ON DELETE RESTRICT,
  created_from_proposal_id bigint NOT NULL
    REFERENCES public.route_change_proposals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT route_conversion_pairs_positive_ids_check
    CHECK (stop_id > 0 AND terminal_id > 0)
);

COMMENT ON TABLE public.route_conversion_pairs IS
  'Durable one-to-one identity mapping between the stop and terminal records that represent the same converted route location.';

COMMENT ON COLUMN public.route_conversion_pairs.created_from_proposal_id IS
  'Approved route-change proposal that first established this stop-terminal pair.';

ALTER TABLE public.route_conversion_pairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.route_conversion_pairs
  FROM PUBLIC, anon, authenticated, service_role;

-- Keep an explicit audit indicator on the proposal point after its temporary
-- point ID has been replaced by the paired, previously approved location ID.
ALTER TABLE public.route_change_proposal_points
  ADD COLUMN IF NOT EXISTS reused_existing_point boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.route_change_proposal_points.reused_existing_point IS
  'True when an approved conversion reused the existing paired stop or terminal record instead of keeping the newly created temporary replacement.';

-- -----------------------------------------------------------------------------
-- 2. Backfill only the verified, unambiguous current pair.
--
-- Older historical proposals contain overlapping/ambiguous replacement chains.
-- They are intentionally not inferred or backfilled by name or coordinates.
-- -----------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_match_count integer;
BEGIN
  SELECT pg_catalog.count(*)::integer
  INTO v_match_count
  FROM public.route_change_proposals AS proposal
  JOIN public.route_change_proposal_points AS original_point
    ON original_point.proposal_id = proposal.id
  JOIN public.route_change_proposal_points AS replacement_point
    ON replacement_point.proposal_id = original_point.proposal_id
   AND replacement_point.is_new_point IS TRUE
   AND replacement_point.replaces_stop_order = original_point.stop_order
  WHERE proposal.id = 171922
    AND proposal.route_id = 15
    AND proposal.status = 'approved'
    AND proposal.applied_at IS NOT NULL
    AND original_point.is_new_point IS FALSE
    AND original_point.is_removed_from_route IS TRUE
    AND original_point.stop_id = 46
    AND original_point.terminal_id IS NULL
    AND replacement_point.terminal_id = 171924
    AND replacement_point.stop_id IS NULL;

  IF v_match_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one verified historical conversion pair (Stop 46 <-> Terminal 171924) from approved proposal 171922; found %.',
      v_match_count
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.route_conversion_pairs AS pair_row
    WHERE (pair_row.stop_id = 46 AND pair_row.terminal_id <> 171924)
       OR (pair_row.terminal_id = 171924 AND pair_row.stop_id <> 46)
  ) THEN
    RAISE EXCEPTION
      'The verified historical location IDs are already paired with different records.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.route_conversion_pairs (
    stop_id,
    terminal_id,
    created_from_proposal_id
  )
  VALUES (46, 171924, 171922)
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.route_conversion_pairs AS pair_row
    WHERE pair_row.stop_id = 46
      AND pair_row.terminal_id = 171924
      AND pair_row.created_from_proposal_id = 171922
  ) THEN
    RAISE EXCEPTION
      'The verified historical stop-terminal pair could not be registered.'
      USING ERRCODE = '23514';
  END IF;
END;
$backfill$;

-- Proposal 171922 is already approved in the live database. Its original
-- Stop 46 was detached from Route 15 but the previous trigger left it active.
-- Bring this one verified source record into the agreed retired state, but
-- only if no route currently references it. Do not modify the older ambiguous
-- historical records.
UPDATE public.stops AS stop_row
SET
  is_active = false,
  is_deleted = true,
  deleted_at = CASE
    WHEN stop_row.is_deleted IS TRUE
      THEN COALESCE(stop_row.deleted_at, proposal.applied_at)
    ELSE proposal.applied_at
  END,
  deleted_by = proposal.moderated_by
FROM public.route_change_proposals AS proposal
WHERE proposal.id = 171922
  AND proposal.status = 'approved'
  AND proposal.applied_at IS NOT NULL
  AND stop_row.id = 46
  AND NOT EXISTS (
    SELECT 1
    FROM public.route_stops AS remaining_route_stop
    WHERE remaining_route_stop.stop_id = stop_row.id
  )
  AND (
    stop_row.is_active IS DISTINCT FROM false
    OR stop_row.is_deleted IS DISTINCT FROM true
    OR stop_row.deleted_at IS NULL
    OR (
      proposal.moderated_by IS NOT NULL
      AND stop_row.deleted_by IS DISTINCT FROM proposal.moderated_by
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Finalize approved conversions after the existing route-edit trigger.
--
-- The existing moderator RPC still validates and approves the temporary
-- replacement. The existing apply_route_change_proposal_edits() trigger then
-- detaches the source point and reorders route_stops. This function runs after
-- that trigger, in the same transaction, and either:
--   a) registers a first-time pair; or
--   b) swaps the temporary replacement for the exact paired existing record.
-- It then retires the detached source only when no route still references it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_route_change_conversion_pairs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_conversion record;

  v_route_transport_type_id bigint;

  v_pair_found boolean;
  v_pair_stop_id bigint;
  v_pair_terminal_id bigint;

  v_target_is_approved boolean;
  v_target_moderation_status text;
  v_target_is_banned boolean;
  v_target_transport_type_id bigint;
  v_target_stop_type text;

  v_updated_count integer;
  v_deleted_count integer;
BEGIN
  -- This trigger is only meaningful on the transition that records a
  -- successfully synchronized, approved proposal.
  IF NEW.status IS DISTINCT FROM 'approved'
     OR NEW.applied_at IS NULL
     OR OLD.applied_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT route_row.transport_type_id
  INTO v_route_transport_type_id
  FROM public.routes AS route_row
  WHERE route_row.id = NEW.route_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'The route for approved conversion proposal % no longer exists.',
      NEW.id
      USING ERRCODE = '23514';
  END IF;

  FOR v_conversion IN
    SELECT
      removed_point.stop_order AS source_stop_order,
      removed_point.stop_id AS source_stop_id,
      removed_point.terminal_id AS source_terminal_id,
      replacement_point.stop_order AS replacement_stop_order,
      replacement_point.stop_id AS replacement_stop_id,
      replacement_point.terminal_id AS replacement_terminal_id
    FROM public.route_change_proposal_points AS removed_point
    JOIN public.route_change_proposal_points AS replacement_point
      ON replacement_point.proposal_id = removed_point.proposal_id
     AND replacement_point.is_new_point IS TRUE
     AND replacement_point.replaces_stop_order = removed_point.stop_order
    WHERE removed_point.proposal_id = NEW.id
      AND removed_point.is_new_point IS FALSE
      AND removed_point.is_removed_from_route IS TRUE
    ORDER BY removed_point.stop_order
  LOOP
    -- A conversion must always switch between a stop and a terminal.
    IF NOT (
      (v_conversion.source_stop_id IS NOT NULL
       AND v_conversion.source_terminal_id IS NULL
       AND v_conversion.replacement_terminal_id IS NOT NULL
       AND v_conversion.replacement_stop_id IS NULL)
      OR
      (v_conversion.source_terminal_id IS NOT NULL
       AND v_conversion.source_stop_id IS NULL
       AND v_conversion.replacement_stop_id IS NOT NULL
       AND v_conversion.replacement_terminal_id IS NULL)
    ) THEN
      RAISE EXCEPTION
        'Approved proposal % contains an invalid stop-terminal conversion pair at source sequence %.',
        NEW.id,
        v_conversion.source_stop_order
        USING ERRCODE = '23514';
    END IF;

    v_pair_stop_id := NULL;
    v_pair_terminal_id := NULL;
    v_pair_found := false;

    -- Find the counterpart using the exact source record ID. Never infer a
    -- pairing from a name, coordinate, or approximate location match.
    IF v_conversion.source_stop_id IS NOT NULL THEN
      SELECT pair_row.stop_id, pair_row.terminal_id
      INTO v_pair_stop_id, v_pair_terminal_id
      FROM public.route_conversion_pairs AS pair_row
      WHERE pair_row.stop_id = v_conversion.source_stop_id
      FOR UPDATE;
    ELSE
      SELECT pair_row.stop_id, pair_row.terminal_id
      INTO v_pair_stop_id, v_pair_terminal_id
      FROM public.route_conversion_pairs AS pair_row
      WHERE pair_row.terminal_id = v_conversion.source_terminal_id
      FOR UPDATE;
    END IF;

    v_pair_found := FOUND;

    IF NOT v_pair_found THEN
      -- First approved conversion for this source: establish its permanent
      -- one-to-one pair using the newly approved replacement record.
      IF v_conversion.source_stop_id IS NOT NULL THEN
        IF EXISTS (
          SELECT 1
          FROM public.route_conversion_pairs AS pair_row
          WHERE pair_row.stop_id = v_conversion.source_stop_id
             OR pair_row.terminal_id = v_conversion.replacement_terminal_id
        ) THEN
          RAISE EXCEPTION
            'The proposed stop-terminal pair for proposal % conflicts with an existing pair.',
            NEW.id
            USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.route_conversion_pairs (
          stop_id,
          terminal_id,
          created_from_proposal_id
        )
        VALUES (
          v_conversion.source_stop_id,
          v_conversion.replacement_terminal_id,
          NEW.id
        );

      ELSE
        IF EXISTS (
          SELECT 1
          FROM public.route_conversion_pairs AS pair_row
          WHERE pair_row.terminal_id = v_conversion.source_terminal_id
             OR pair_row.stop_id = v_conversion.replacement_stop_id
        ) THEN
          RAISE EXCEPTION
            'The proposed terminal-stop pair for proposal % conflicts with an existing pair.',
            NEW.id
            USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.route_conversion_pairs (
          stop_id,
          terminal_id,
          created_from_proposal_id
        )
        VALUES (
          v_conversion.replacement_stop_id,
          v_conversion.source_terminal_id,
          NEW.id
        );
      END IF;

    ELSE
      -- A pair already exists. Restore its original counterpart and replace
      -- the just-created temporary row with that exact existing record.
      IF v_conversion.source_stop_id IS NOT NULL THEN
        -- Existing source is a stop, so its paired counterpart is a terminal.
        IF v_pair_terminal_id IS NULL
           OR v_pair_terminal_id = v_conversion.replacement_terminal_id
        THEN
          RAISE EXCEPTION
            'The existing terminal counterpart for proposal % is invalid.',
            NEW.id
            USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM public.route_stops AS route_stop
          WHERE route_stop.route_id = NEW.route_id
            AND route_stop.terminal_id = v_pair_terminal_id
        ) THEN
          RAISE EXCEPTION
            'The existing terminal counterpart % already appears on route %; automatic replacement would create a duplicate route location.',
            v_pair_terminal_id,
            NEW.route_id
            USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM public.route_change_proposal_points AS proposal_point
          WHERE proposal_point.proposal_id = NEW.id
            AND proposal_point.terminal_id = v_pair_terminal_id
            AND proposal_point.stop_order <> v_conversion.replacement_stop_order
        ) THEN
          RAISE EXCEPTION
            'The existing terminal counterpart % already appears elsewhere in proposal %.',
            v_pair_terminal_id,
            NEW.id
            USING ERRCODE = '23514';
        END IF;

        SELECT
          terminal_row.is_approved,
          terminal_row.moderation_status,
          terminal_row.is_banned,
          terminal_row.transport_type_id
        INTO
          v_target_is_approved,
          v_target_moderation_status,
          v_target_is_banned,
          v_target_transport_type_id
        FROM public.terminals AS terminal_row
        WHERE terminal_row.id = v_pair_terminal_id
        FOR UPDATE;

        IF NOT FOUND
           OR v_target_is_approved IS NOT TRUE
           OR v_target_moderation_status IS DISTINCT FROM 'approved'
           OR v_target_is_banned IS TRUE
           OR v_target_transport_type_id IS DISTINCT FROM v_route_transport_type_id
        THEN
          RAISE EXCEPTION
            'The original terminal counterpart % is no longer approved or compatible with route %.',
            v_pair_terminal_id,
            NEW.route_id
            USING ERRCODE = '23514';
        END IF;

        -- Restore before reconnecting it to route_stops. Existing photos,
        -- moderation history, and public storage paths remain on the same row.
        UPDATE public.terminals AS terminal_row
        SET
          is_active = true,
          is_deleted = false,
          deleted_at = NULL,
          deleted_by = NULL
        WHERE terminal_row.id = v_pair_terminal_id
          AND (
            terminal_row.is_active IS DISTINCT FROM true
            OR terminal_row.is_deleted IS DISTINCT FROM false
            OR terminal_row.deleted_at IS NOT NULL
            OR terminal_row.deleted_by IS NOT NULL
          );

        UPDATE public.map_images AS image_row
        SET terminal_id = v_pair_terminal_id
        WHERE image_row.terminal_id = v_conversion.replacement_terminal_id;

        UPDATE public.route_stops AS route_stop
        SET
          terminal_id = v_pair_terminal_id,
          stop_id = NULL
        WHERE route_stop.route_id = NEW.route_id
          AND route_stop.terminal_id = v_conversion.replacement_terminal_id;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        IF v_updated_count <> 1 THEN
          RAISE EXCEPTION
            'The temporary terminal % was not present exactly once on route %.',
            v_conversion.replacement_terminal_id,
            NEW.route_id
            USING ERRCODE = '23514';
        END IF;

        UPDATE public.route_change_proposal_points AS proposal_point
        SET
          terminal_id = v_pair_terminal_id,
          reused_existing_point = true
        WHERE proposal_point.proposal_id = NEW.id
          AND proposal_point.stop_order = v_conversion.replacement_stop_order
          AND proposal_point.terminal_id = v_conversion.replacement_terminal_id
          AND proposal_point.is_new_point IS TRUE
          AND proposal_point.replaces_stop_order = v_conversion.source_stop_order;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        IF v_updated_count <> 1 THEN
          RAISE EXCEPTION
            'The proposal history could not be updated to reference the restored terminal %.',
            v_pair_terminal_id
            USING ERRCODE = '23514';
        END IF;

        -- Do not allow the temporary row to be deleted if an unexpected
        -- dependent record still points to it. These checks also protect
        -- saved locations and fares from accidental cascade/restrict effects.
        IF EXISTS (
          SELECT 1 FROM public.route_stops
          WHERE terminal_id = v_conversion.replacement_terminal_id
        ) OR EXISTS (
          SELECT 1 FROM public.route_change_proposal_points
          WHERE terminal_id = v_conversion.replacement_terminal_id
        ) OR EXISTS (
          SELECT 1 FROM public.map_images
          WHERE terminal_id = v_conversion.replacement_terminal_id
        ) OR EXISTS (
          SELECT 1 FROM public.saved_routes
          WHERE origin_terminal_id = v_conversion.replacement_terminal_id
             OR destination_terminal_id = v_conversion.replacement_terminal_id
        ) OR EXISTS (
          SELECT 1 FROM public.saved_terminals
          WHERE terminal_id = v_conversion.replacement_terminal_id
        ) THEN
          RAISE EXCEPTION
            'Temporary terminal % still has dependent records and cannot be safely removed.',
            v_conversion.replacement_terminal_id
            USING ERRCODE = '23514';
        END IF;

        DELETE FROM public.terminals AS terminal_row
        WHERE terminal_row.id = v_conversion.replacement_terminal_id;

        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        IF v_deleted_count <> 1 THEN
          RAISE EXCEPTION
            'The temporary terminal % could not be removed after reuse.',
            v_conversion.replacement_terminal_id
            USING ERRCODE = '23514';
        END IF;

      ELSE
        -- Existing source is a terminal, so its paired counterpart is a stop.
        IF v_pair_stop_id IS NULL
           OR v_pair_stop_id = v_conversion.replacement_stop_id
        THEN
          RAISE EXCEPTION
            'The existing stop counterpart for proposal % is invalid.',
            NEW.id
            USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM public.route_stops AS route_stop
          WHERE route_stop.route_id = NEW.route_id
            AND route_stop.stop_id = v_pair_stop_id
        ) THEN
          RAISE EXCEPTION
            'The existing stop counterpart % already appears on route %; automatic replacement would create a duplicate route location.',
            v_pair_stop_id,
            NEW.route_id
            USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM public.route_change_proposal_points AS proposal_point
          WHERE proposal_point.proposal_id = NEW.id
            AND proposal_point.stop_id = v_pair_stop_id
            AND proposal_point.stop_order <> v_conversion.replacement_stop_order
        ) THEN
          RAISE EXCEPTION
            'The existing stop counterpart % already appears elsewhere in proposal %.',
            v_pair_stop_id,
            NEW.id
            USING ERRCODE = '23514';
        END IF;

        SELECT
          stop_row.is_approved,
          stop_row.moderation_status,
          stop_row.is_banned,
          stop_row.transport_type_id,
          stop_row.stop_type
        INTO
          v_target_is_approved,
          v_target_moderation_status,
          v_target_is_banned,
          v_target_transport_type_id,
          v_target_stop_type
        FROM public.stops AS stop_row
        WHERE stop_row.id = v_pair_stop_id
        FOR UPDATE;

        IF NOT FOUND
           OR v_target_is_approved IS NOT TRUE
           OR v_target_moderation_status IS DISTINCT FROM 'approved'
           OR v_target_is_banned IS TRUE
           OR v_target_transport_type_id IS DISTINCT FROM v_route_transport_type_id
           OR v_target_stop_type IS DISTINCT FROM 'road_stop'
        THEN
          RAISE EXCEPTION
            'The original stop counterpart % is no longer approved or compatible with route %.',
            v_pair_stop_id,
            NEW.route_id
            USING ERRCODE = '23514';
        END IF;

        UPDATE public.stops AS stop_row
        SET
          is_active = true,
          is_deleted = false,
          deleted_at = NULL,
          deleted_by = NULL
        WHERE stop_row.id = v_pair_stop_id
          AND (
            stop_row.is_active IS DISTINCT FROM true
            OR stop_row.is_deleted IS DISTINCT FROM false
            OR stop_row.deleted_at IS NOT NULL
            OR stop_row.deleted_by IS NOT NULL
          );

        UPDATE public.map_images AS image_row
        SET stop_id = v_pair_stop_id
        WHERE image_row.stop_id = v_conversion.replacement_stop_id;

        UPDATE public.route_stops AS route_stop
        SET
          stop_id = v_pair_stop_id,
          terminal_id = NULL
        WHERE route_stop.route_id = NEW.route_id
          AND route_stop.stop_id = v_conversion.replacement_stop_id;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        IF v_updated_count <> 1 THEN
          RAISE EXCEPTION
            'The temporary stop % was not present exactly once on route %.',
            v_conversion.replacement_stop_id,
            NEW.route_id
            USING ERRCODE = '23514';
        END IF;

        UPDATE public.route_change_proposal_points AS proposal_point
        SET
          stop_id = v_pair_stop_id,
          reused_existing_point = true
        WHERE proposal_point.proposal_id = NEW.id
          AND proposal_point.stop_order = v_conversion.replacement_stop_order
          AND proposal_point.stop_id = v_conversion.replacement_stop_id
          AND proposal_point.is_new_point IS TRUE
          AND proposal_point.replaces_stop_order = v_conversion.source_stop_order;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        IF v_updated_count <> 1 THEN
          RAISE EXCEPTION
            'The proposal history could not be updated to reference the restored stop %.',
            v_pair_stop_id
            USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
          SELECT 1 FROM public.route_stops
          WHERE stop_id = v_conversion.replacement_stop_id
        ) OR EXISTS (
          SELECT 1 FROM public.route_change_proposal_points
          WHERE stop_id = v_conversion.replacement_stop_id
        ) OR EXISTS (
          SELECT 1 FROM public.map_images
          WHERE stop_id = v_conversion.replacement_stop_id
        ) OR EXISTS (
          SELECT 1 FROM public.rail_fares
          WHERE from_stop_id = v_conversion.replacement_stop_id
             OR to_stop_id = v_conversion.replacement_stop_id
        ) OR EXISTS (
          SELECT 1 FROM public.saved_routes
          WHERE origin_stop_id = v_conversion.replacement_stop_id
             OR destination_stop_id = v_conversion.replacement_stop_id
        ) OR EXISTS (
          SELECT 1 FROM public.saved_stops
          WHERE stop_id = v_conversion.replacement_stop_id
        ) THEN
          RAISE EXCEPTION
            'Temporary stop % still has dependent records and cannot be safely removed.',
            v_conversion.replacement_stop_id
            USING ERRCODE = '23514';
        END IF;

        DELETE FROM public.stops AS stop_row
        WHERE stop_row.id = v_conversion.replacement_stop_id;

        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        IF v_deleted_count <> 1 THEN
          RAISE EXCEPTION
            'The temporary stop % could not be removed after reuse.',
            v_conversion.replacement_stop_id
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;

    -- The original source has already been detached from this route by the
    -- existing apply_route_change_proposal_edits() trigger. Retire it only
    -- when no route anywhere still references it. If another route still
    -- uses it, keep (or restore) it as active and not deleted.
    IF v_conversion.source_stop_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.route_stops AS route_stop
        WHERE route_stop.stop_id = v_conversion.source_stop_id
      ) THEN
        UPDATE public.stops AS stop_row
        SET
          is_active = true,
          is_deleted = false,
          deleted_at = NULL,
          deleted_by = NULL
        WHERE stop_row.id = v_conversion.source_stop_id
          AND (
            stop_row.is_active IS DISTINCT FROM true
            OR stop_row.is_deleted IS DISTINCT FROM false
            OR stop_row.deleted_at IS NOT NULL
            OR stop_row.deleted_by IS NOT NULL
          );
      ELSE
        UPDATE public.stops AS stop_row
        SET
          is_active = false,
          is_deleted = true,
          deleted_at = CASE
            WHEN stop_row.is_deleted IS TRUE
              THEN COALESCE(stop_row.deleted_at, pg_catalog.clock_timestamp())
            ELSE pg_catalog.clock_timestamp()
          END,
          deleted_by = COALESCE(NEW.moderated_by, stop_row.deleted_by)
        WHERE stop_row.id = v_conversion.source_stop_id
          AND (
            stop_row.is_active IS DISTINCT FROM false
            OR stop_row.is_deleted IS DISTINCT FROM true
            OR stop_row.deleted_at IS NULL
            OR (
              NEW.moderated_by IS NOT NULL
              AND stop_row.deleted_by IS DISTINCT FROM NEW.moderated_by
            )
          );
      END IF;

    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.route_stops AS route_stop
        WHERE route_stop.terminal_id = v_conversion.source_terminal_id
      ) THEN
        UPDATE public.terminals AS terminal_row
        SET
          is_active = true,
          is_deleted = false,
          deleted_at = NULL,
          deleted_by = NULL
        WHERE terminal_row.id = v_conversion.source_terminal_id
          AND (
            terminal_row.is_active IS DISTINCT FROM true
            OR terminal_row.is_deleted IS DISTINCT FROM false
            OR terminal_row.deleted_at IS NOT NULL
            OR terminal_row.deleted_by IS NOT NULL
          );
      ELSE
        UPDATE public.terminals AS terminal_row
        SET
          is_active = false,
          is_deleted = true,
          deleted_at = CASE
            WHEN terminal_row.is_deleted IS TRUE
              THEN COALESCE(terminal_row.deleted_at, pg_catalog.clock_timestamp())
            ELSE pg_catalog.clock_timestamp()
          END,
          deleted_by = COALESCE(NEW.moderated_by, terminal_row.deleted_by)
        WHERE terminal_row.id = v_conversion.source_terminal_id
          AND (
            terminal_row.is_active IS DISTINCT FROM false
            OR terminal_row.is_deleted IS DISTINCT FROM true
            OR terminal_row.deleted_at IS NULL
            OR (
              NEW.moderated_by IS NOT NULL
              AND terminal_row.deleted_by IS DISTINCT FROM NEW.moderated_by
            )
          );
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_route_change_conversion_pairs()
  FROM PUBLIC, anon, authenticated, service_role;

-- PostgreSQL fires same-kind triggers alphabetically by trigger name.
-- This name intentionally sorts after trg_apply_route_change_proposal_edits,
-- so the existing route detach/reorder completes before conversion finalization.
DROP TRIGGER IF EXISTS zzzz_finalize_route_change_conversion_pairs
  ON public.route_change_proposals;

CREATE TRIGGER zzzz_finalize_route_change_conversion_pairs
AFTER UPDATE OF applied_at ON public.route_change_proposals
FOR EACH ROW
WHEN (
  OLD.applied_at IS NULL
  AND NEW.applied_at IS NOT NULL
  AND NEW.status = 'approved'
)
EXECUTE FUNCTION public.finalize_route_change_conversion_pairs();

COMMENT ON TRIGGER zzzz_finalize_route_change_conversion_pairs
  ON public.route_change_proposals IS
  'After the existing route-edit trigger applies an approved proposal, restores the exact paired location on reverse conversions and retires the detached source only when no route references it.';

COMMIT;

-- -----------------------------------------------------------------------------
-- 4. Post-migration verification.
-- Run these SELECTs after the migration commits.
-- -----------------------------------------------------------------------------
-- SELECT * FROM public.route_conversion_pairs ORDER BY stop_id;
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'route_change_proposal_points'
--   AND column_name = 'reused_existing_point';
--
-- SELECT
--   t.tgname,
--   pg_catalog.pg_get_triggerdef(t.oid) AS trigger_definition
-- FROM pg_catalog.pg_trigger AS t
-- JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
-- JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname = 'route_change_proposals'
--   AND NOT t.tgisinternal
-- ORDER BY t.tgname;
