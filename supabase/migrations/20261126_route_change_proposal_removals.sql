-- Add approved-only removal requests to Modify route proposals.
-- Pending/rejected/withdrawn proposals never alter route_stops or is_deleted.
-- Removed shared locations are soft-deleted only when no route still uses them.
BEGIN;

ALTER TABLE public.route_change_proposals
  DROP CONSTRAINT IF EXISTS route_change_proposals_type_check;

ALTER TABLE public.route_change_proposals
  ADD CONSTRAINT route_change_proposals_type_check
  CHECK (proposal_type = ANY (ARRAY[
    'insert_point'::text,
    'extend_route'::text,
    'combined'::text,
    'remove_points'::text
  ]));

CREATE OR REPLACE FUNCTION public.submit_route_change_proposal(p_route_id bigint, p_proposal_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$

DECLARE

    -- Authenticated contributor.
    v_actor uuid := auth.uid();
    v_role text;

    -- Contributor profile.
    v_contributor_display_name text;
    v_profile_deleted boolean;

    -- Existing route.
    v_route_name text;
    v_transport_type_id bigint;
    v_variant_id bigint;
    v_fare_model text;

    -- Proposal.
    v_proposal_id bigint;
    v_proposed_name text;
    v_base_snapshot jsonb;

    -- Existing route sequence.
    v_base_keys text[];
    v_base_count integer;

    -- Proposed sequence.
    v_points jsonb;
    v_point jsonb;

    v_point_count integer;
    v_sequence_keys text[] := ARRAY[]::text[];

    v_kind text;
    v_key text;

    v_existing_json jsonb;
    v_existing_id bigint;

    v_id bigint;
    v_stop_type text;
    v_name text;
    v_description text;

    v_latitude double precision;
    v_longitude double precision;

    v_is_new_point boolean := false;

    -- Sequence validation.
    v_added_count integer := 0;
    v_internal_added_count integer := 0;

    v_previous_base_position integer := 0;
    v_first_base_position integer;
    v_last_base_position integer;
    v_current_position integer;

    v_i integer;

    -- Result.
    v_result_points jsonb := '[]'::jsonb;

BEGIN

    -- ========================================================
    -- A. AUTHENTICATION AND ROLE VALIDATION
    -- ========================================================

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Authentication required.'
            USING ERRCODE = '42501';
    END IF;


    SELECT role_row.role::text
    INTO v_role
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = v_actor;


    IF v_role IS NULL
       OR v_role NOT IN ('registered_user', 'admin')
    THEN
        RAISE EXCEPTION 'Route contribution access required.'
            USING ERRCODE = '42501';
    END IF;


    -- ========================================================
    -- B. VERIFY CONTRIBUTOR PROFILE
    -- ========================================================

    SELECT
        coalesce(
            nullif(btrim(profile_row.display_name), ''),
            'Unnamed contributor'
        ),
        profile_row.is_deleted

    INTO
        v_contributor_display_name,
        v_profile_deleted

    FROM public.profiles AS profile_row
    WHERE profile_row.id = v_actor;


    IF NOT FOUND OR v_profile_deleted IS TRUE THEN
        RAISE EXCEPTION
            'An active contributor profile is required.'
            USING ERRCODE = '42501';
    END IF;


    -- ========================================================
    -- C. VALIDATE REQUEST
    -- ========================================================

    IF p_route_id IS NULL OR p_route_id <= 0 THEN
        RAISE EXCEPTION 'Invalid target route.'
            USING ERRCODE = '22023';
    END IF;


    IF p_proposal_type IS NULL
       OR p_proposal_type NOT IN (
           'insert_point',
           'extend_route',
           'remove_points'
       )
    THEN
        RAISE EXCEPTION 'Invalid route-change proposal type.'
            USING ERRCODE = '22023';
    END IF;


    IF p_payload IS NULL
       OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    THEN
        RAISE EXCEPTION 'A valid proposal payload is required.'
            USING ERRCODE = '22023';
    END IF;


    IF EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_object_keys(p_payload)
            AS payload_keys(key)
        WHERE payload_keys.key NOT IN (
            'proposed_name',
            'points'
        )
    ) THEN
        RAISE EXCEPTION 'The proposal payload contains unsupported fields.'
            USING ERRCODE = '22023';
    END IF;


    IF NOT (p_payload ? 'points')
       OR jsonb_typeof(p_payload -> 'points')
            IS DISTINCT FROM 'array'
    THEN
        RAISE EXCEPTION 'A complete proposed route sequence is required.'
            USING ERRCODE = '22023';
    END IF;


    v_points := p_payload -> 'points';

    v_point_count := jsonb_array_length(v_points);


    IF v_point_count < 2 OR v_point_count > 100 THEN
        RAISE EXCEPTION
            'A proposed route must contain between 2 and 100 locations.'
            USING ERRCODE = '22023';
    END IF;


    -- Optional proposed route name.

    IF p_payload ? 'proposed_name' THEN

        IF jsonb_typeof(p_payload -> 'proposed_name')
            NOT IN ('string', 'null')
        THEN
            RAISE EXCEPTION 'Invalid proposed route name.'
                USING ERRCODE = '22023';
        END IF;

        IF jsonb_typeof(p_payload -> 'proposed_name') = 'string' THEN

            IF char_length(
                btrim(p_payload ->> 'proposed_name')
            ) > 180 THEN
                RAISE EXCEPTION
                    'The proposed route name cannot exceed 180 characters.'
                    USING ERRCODE = '22023';
            END IF;

            v_proposed_name :=
                nullif(btrim(p_payload ->> 'proposed_name'), '');

        END IF;

    END IF;


    -- ========================================================
    -- D. ACQUIRE EXISTING ROUTE-MANAGEMENT TRANSACTION LOCK
    -- ========================================================

    PERFORM pg_catalog.pg_advisory_xact_lock(
        913713,
        42001
    );


    -- ========================================================
    -- E. LOAD AND LOCK THE EXISTING APPROVED ROUTE
    -- ========================================================

    SELECT
        route_row.name,
        route_row.transport_type_id,
        route_row.variant_id,
        variant_row.fare_model::text

    INTO
        v_route_name,
        v_transport_type_id,
        v_variant_id,
        v_fare_model

    FROM public.routes AS route_row

    JOIN public.transport_variants AS variant_row
        ON variant_row.id = route_row.variant_id
       AND variant_row.transport_type_id =
           route_row.transport_type_id

    WHERE route_row.id = p_route_id

    FOR UPDATE OF route_row;


    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target route was not found.'
            USING ERRCODE = 'P0002';
    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM public.routes AS route_row
        WHERE route_row.id = p_route_id
          AND route_row.is_approved IS TRUE
          AND route_row.moderation_status = 'approved'
          AND route_row.is_active IS TRUE
          AND coalesce(route_row.is_deleted, false) IS FALSE
          AND coalesce(route_row.is_banned, false) IS FALSE
    ) THEN
        RAISE EXCEPTION
            'Only active, approved routes can receive modification proposals.';
    END IF;


    -- Reuse the existing canonical transport-compatibility
    -- validator for the approved route.

    PERFORM public.assert_route_location_compatibility(
        p_route_id
    );


    -- ========================================================
    -- F. CAPTURE THE ORIGINAL APPROVED ROUTE SEQUENCE
    -- ========================================================

    SELECT
        count(*)::integer,

        array_agg(
            CASE
                WHEN route_stop.terminal_id IS NOT NULL
                    THEN 'terminal:' || route_stop.terminal_id::text
                ELSE 'stop:' || route_stop.stop_id::text
            END
            ORDER BY route_stop.stop_order
        )

    INTO
        v_base_count,
        v_base_keys

    FROM public.route_stops AS route_stop
    WHERE route_stop.route_id = p_route_id;


    IF v_base_count < 2 OR v_base_count > 100 THEN
        RAISE EXCEPTION
            'The existing route does not have a valid sequence for modification.';
    END IF;


    -- Every existing route location must remain approved
    -- and compatible while the proposal is being submitted.

    IF EXISTS (

        SELECT 1

        FROM public.route_stops AS route_stop

        LEFT JOIN public.terminals AS terminal_row
            ON terminal_row.id = route_stop.terminal_id

        LEFT JOIN public.stops AS stop_row
            ON stop_row.id = route_stop.stop_id

        WHERE route_stop.route_id = p_route_id

          AND (

              (
                  route_stop.terminal_id IS NOT NULL

                  AND (
                      terminal_row.id IS NULL
                      OR terminal_row.is_approved IS NOT TRUE
                      OR terminal_row.moderation_status
                            IS DISTINCT FROM 'approved'
                      OR terminal_row.is_active IS NOT TRUE
                      OR coalesce(terminal_row.is_deleted, false)
                      OR coalesce(terminal_row.is_banned, false)
                      OR terminal_row.transport_type_id
                            IS DISTINCT FROM v_transport_type_id
                      OR v_fare_model = 'matrix'
                  )
              )

              OR

              (
                  route_stop.stop_id IS NOT NULL

                  AND (
                      stop_row.id IS NULL
                      OR stop_row.is_approved IS NOT TRUE
                      OR stop_row.moderation_status
                            IS DISTINCT FROM 'approved'
                      OR stop_row.is_active IS NOT TRUE
                      OR coalesce(stop_row.is_deleted, false)
                      OR coalesce(stop_row.is_banned, false)
                      OR stop_row.transport_type_id
                            IS DISTINCT FROM v_transport_type_id

                      OR (
                          v_fare_model = 'matrix'
                          AND stop_row.stop_type
                                IS DISTINCT FROM 'train_station'
                      )

                      OR (
                          v_fare_model = 'distance'
                          AND stop_row.stop_type
                                IS DISTINCT FROM 'road_stop'
                      )
                  )
              )

          )

    ) THEN

        RAISE EXCEPTION
            'The existing route contains a location that is no longer eligible.';

    END IF;


    -- ========================================================
    -- G. BUILD THE ORIGINAL ROUTE SNAPSHOT
    -- ========================================================

    SELECT pg_catalog.jsonb_build_object(

        'route_id',
        p_route_id,

        'name',
        v_route_name,

        'transport_type_id',
        v_transport_type_id,

        'variant_id',
        v_variant_id,

        'route_stops',

        coalesce(

            (
                SELECT pg_catalog.jsonb_agg(

                    pg_catalog.jsonb_build_object(

                        'route_stop_id',
                        route_stop.id,

                        'stop_order',
                        route_stop.stop_order,

                        'kind',
                        CASE
                            WHEN route_stop.terminal_id IS NOT NULL
                                THEN 'terminal'
                            ELSE 'stop'
                        END,

                        'location_id',
                        coalesce(
                            route_stop.terminal_id,
                            route_stop.stop_id
                        ),

                        'location_name',
                        coalesce(
                            terminal_row.name,
                            stop_row.name
                        )

                    )

                    ORDER BY route_stop.stop_order

                )

                FROM public.route_stops AS route_stop

                LEFT JOIN public.terminals AS terminal_row
                    ON terminal_row.id = route_stop.terminal_id

                LEFT JOIN public.stops AS stop_row
                    ON stop_row.id = route_stop.stop_id

                WHERE route_stop.route_id = p_route_id
            ),

            '[]'::jsonb

        )

    )

    INTO v_base_snapshot;


    -- ========================================================
    -- H. CREATE THE PENDING PROPOSAL RECORD
    -- ========================================================

    INSERT INTO public.route_change_proposals (

        route_id,
        contributor_id,
        contributor_display_name,
        proposal_type,
        proposed_name,
        base_route_snapshot,
        status

    )

    VALUES (

        p_route_id,
        v_actor,
        v_contributor_display_name,
        p_proposal_type,
        v_proposed_name,
        v_base_snapshot,
        'pending'

    )

    RETURNING id INTO v_proposal_id;


    -- ========================================================
    -- I. RESOLVE AND STORE THE COMPLETE PROPOSED SEQUENCE
    -- ========================================================

    FOR v_point IN

        SELECT value
        FROM pg_catalog.jsonb_array_elements(v_points)

    LOOP

        v_kind := NULL;
        v_id := NULL;
        v_existing_id := NULL;
        v_stop_type := NULL;
        v_is_new_point := false;


        -- ----------------------------------------------------
        -- I-1. Validate one point object.
        -- ----------------------------------------------------

        IF jsonb_typeof(v_point)
            IS DISTINCT FROM 'object'
        THEN
            RAISE EXCEPTION 'Every proposed location must be an object.'
                USING ERRCODE = '22023';
        END IF;


        IF jsonb_typeof(v_point -> 'kind')
            IS DISTINCT FROM 'string'
        THEN
            RAISE EXCEPTION 'Every proposed location needs a valid kind.'
                USING ERRCODE = '22023';
        END IF;


        v_kind := v_point ->> 'kind';


        IF v_kind NOT IN ('terminal', 'stop') THEN
            RAISE EXCEPTION 'Invalid proposed location kind.'
                USING ERRCODE = '22023';
        END IF;


        v_existing_json := v_point -> 'existing_id';


        -- ----------------------------------------------------
        -- I-2. Existing approved location.
        -- ----------------------------------------------------

        IF v_existing_json IS NOT NULL
           AND v_existing_json <> 'null'::jsonb
        THEN

            IF EXISTS (
                SELECT 1
                FROM pg_catalog.jsonb_object_keys(v_point)
                    AS point_keys(key)
                WHERE point_keys.key NOT IN (
                    'kind',
                    'existing_id'
                )
            ) THEN

                RAISE EXCEPTION
                    'Existing locations cannot include new-location fields.'
                    USING ERRCODE = '22023';

            END IF;


            IF jsonb_typeof(v_existing_json)
                    IS DISTINCT FROM 'number'
               OR (v_point ->> 'existing_id')
                    !~ '^[1-9][0-9]*$'
            THEN

                RAISE EXCEPTION
                    'Existing location IDs must be positive integers.'
                    USING ERRCODE = '22023';

            END IF;


            v_existing_id :=
                (v_point ->> 'existing_id')::bigint;


            IF v_kind = 'terminal' THEN

                IF v_fare_model = 'matrix' THEN
                    RAISE EXCEPTION
                        'Train routes cannot include terminals.';
                END IF;


                SELECT terminal_row.id

                INTO v_id

                FROM public.terminals AS terminal_row

                WHERE terminal_row.id = v_existing_id

                  AND terminal_row.is_approved IS TRUE

                  AND terminal_row.moderation_status = 'approved'

                  AND terminal_row.is_active IS TRUE

                  AND coalesce(terminal_row.is_deleted, false) IS FALSE

                  AND coalesce(terminal_row.is_banned, false) IS FALSE

                  AND terminal_row.transport_type_id =
                      v_transport_type_id;


                IF NOT FOUND THEN
                    RAISE EXCEPTION
                        'The selected terminal is unavailable or incompatible.';
                END IF;


            ELSE

                SELECT
                    stop_row.id,
                    stop_row.stop_type

                INTO
                    v_id,
                    v_stop_type

                FROM public.stops AS stop_row

                WHERE stop_row.id = v_existing_id

                  AND stop_row.is_approved IS TRUE

                  AND stop_row.moderation_status = 'approved'

                  AND stop_row.is_active IS TRUE

                  AND coalesce(stop_row.is_deleted, false) IS FALSE

                  AND coalesce(stop_row.is_banned, false) IS FALSE

                  AND stop_row.transport_type_id =
                      v_transport_type_id;


                IF NOT FOUND THEN
                    RAISE EXCEPTION
                        'The selected stop is unavailable or incompatible.';
                END IF;


                IF (
                    v_fare_model = 'matrix'
                    AND v_stop_type IS DISTINCT FROM 'train_station'
                ) OR (
                    v_fare_model = 'distance'
                    AND v_stop_type IS DISTINCT FROM 'road_stop'
                ) THEN

                    RAISE EXCEPTION
                        'The selected stop is incompatible with this route.';

                END IF;

            END IF;


        -- ----------------------------------------------------
        -- I-3. New location created specifically for proposal.
        -- ----------------------------------------------------

        ELSE

            IF EXISTS (
                SELECT 1
                FROM pg_catalog.jsonb_object_keys(v_point)
                    AS point_keys(key)
                WHERE point_keys.key NOT IN (
                    'kind',
                    'existing_id',
                    'name',
                    'description',
                    'stop_type',
                    'latitude',
                    'longitude'
                )
            ) THEN

                RAISE EXCEPTION
                    'New location contains unsupported fields.'
                    USING ERRCODE = '22023';

            END IF;


            IF v_point ? 'name' IS FALSE
               OR jsonb_typeof(v_point -> 'name')
                    IS DISTINCT FROM 'string'
            THEN

                RAISE EXCEPTION
                    'Every new location requires a name.'
                    USING ERRCODE = '22023';

            END IF;


            v_name := left(
                btrim(v_point ->> 'name'),
                120
            );


            IF v_name = '' THEN
                RAISE EXCEPTION
                    'Every new location requires a name.';
            END IF;


            IF jsonb_typeof(v_point -> 'latitude')
                    IS DISTINCT FROM 'number'
               OR jsonb_typeof(v_point -> 'longitude')
                    IS DISTINCT FROM 'number'
            THEN

                RAISE EXCEPTION
                    'New locations require valid numeric coordinates.'
                    USING ERRCODE = '22023';

            END IF;


            v_latitude :=
                (v_point ->> 'latitude')::double precision;

            v_longitude :=
                (v_point ->> 'longitude')::double precision;


            IF v_latitude NOT BETWEEN -90 AND 90
               OR v_longitude NOT BETWEEN -180 AND 180
            THEN

                RAISE EXCEPTION
                    'New location coordinates are outside valid geographic bounds.'
                    USING ERRCODE = '22023';

            END IF;


            v_is_new_point := true;


            -- -----------------------------------------------
            -- Create a new terminal.
            -- -----------------------------------------------

            IF v_kind = 'terminal' THEN

                IF v_fare_model = 'matrix' THEN
                    RAISE EXCEPTION
                        'Train routes cannot include terminals.';
                END IF;


                IF v_point ? 'description'
                   OR v_point ? 'stop_type'
                THEN

                    RAISE EXCEPTION
                        'Terminal submissions cannot contain stop-specific fields.'
                        USING ERRCODE = '22023';

                END IF;


                INSERT INTO public.terminals (

                    name,
                    latitude,
                    longitude,
                    transport_type_id,
                    created_by,
                    is_active,
                    is_approved,
                    moderation_status,
                    is_banned,
                    is_deleted

                )

                VALUES (

                    v_name,
                    v_latitude,
                    v_longitude,
                    v_transport_type_id,
                    v_actor,
                    true,
                    false,
                    'pending',
                    false,
                    false

                )

                RETURNING id INTO v_id;


            -- -----------------------------------------------
            -- Create a new stop.
            -- -----------------------------------------------

            ELSE

                IF v_point ? 'description'
                   AND jsonb_typeof(v_point -> 'description')
                        NOT IN ('string', 'null')
                THEN

                    RAISE EXCEPTION
                        'Stop description must be text.'
                        USING ERRCODE = '22023';

                END IF;


                IF v_point ? 'stop_type'
                   AND jsonb_typeof(v_point -> 'stop_type')
                        NOT IN ('string', 'null')
                THEN

                    RAISE EXCEPTION
                        'Invalid stop type.'
                        USING ERRCODE = '22023';

                END IF;


                v_stop_type := coalesce(
                    v_point ->> 'stop_type',
                    'road_stop'
                );


                IF v_stop_type NOT IN (
                    'road_stop',
                    'train_station'
                ) THEN

                    RAISE EXCEPTION
                        'Invalid stop type.'
                        USING ERRCODE = '22023';

                END IF;


                IF (
                    v_fare_model = 'matrix'
                    AND v_stop_type <> 'train_station'
                ) OR (
                    v_fare_model = 'distance'
                    AND v_stop_type <> 'road_stop'
                ) THEN

                    RAISE EXCEPTION
                        'The new stop type is incompatible with this route.';

                END IF;


                v_description := nullif(
                    left(
                        btrim(coalesce(v_point ->> 'description', '')),
                        500
                    ),
                    ''
                );


                INSERT INTO public.stops (

                    name,
                    description,
                    stop_type,
                    latitude,
                    longitude,
                    transport_type_id,
                    created_by,
                    is_active,
                    is_approved,
                    moderation_status,
                    is_banned,
                    is_deleted

                )

                VALUES (

                    v_name,
                    v_description,
                    v_stop_type,
                    v_latitude,
                    v_longitude,
                    v_transport_type_id,
                    v_actor,
                    true,
                    false,
                    'pending',
                    false,
                    false

                )

                RETURNING id INTO v_id;

            END IF;

        END IF;


        -- ----------------------------------------------------
        -- I-4. Prevent duplicate locations in this proposal.
        -- ----------------------------------------------------

        v_key := v_kind || ':' || v_id::text;


        IF v_key = ANY(v_sequence_keys) THEN
            RAISE EXCEPTION
                'The same location cannot appear twice in a proposed route.';
        END IF;


        v_sequence_keys :=
            pg_catalog.array_append(v_sequence_keys, v_key);


        IF NOT (v_key = ANY(v_base_keys)) THEN
            v_added_count := v_added_count + 1;
        END IF;


        -- ----------------------------------------------------
        -- I-5. Save the proposed location.
        -- ----------------------------------------------------

        INSERT INTO public.route_change_proposal_points (

            proposal_id,
            stop_order,
            terminal_id,
            stop_id,
            is_new_point

        )

        VALUES (

            v_proposal_id,
            cardinality(v_sequence_keys),

            CASE
                WHEN v_kind = 'terminal' THEN v_id
                ELSE NULL
            END,

            CASE
                WHEN v_kind = 'stop' THEN v_id
                ELSE NULL
            END,

            v_is_new_point

        );


        v_result_points :=
            v_result_points ||
            pg_catalog.jsonb_build_array(

                pg_catalog.jsonb_build_object(
                    'kind', v_kind,
                    'id', v_id,
                    'is_new_point', v_is_new_point
                )

            );

    END LOOP;


    -- ========================================================
    -- J. VALIDATE PRESERVATION OF ORIGINAL ROUTE LOCATIONS
    -- ========================================================

    -- Every original route location must remain in the proposal
    -- and maintain its original relative order.

    FOR v_i IN 1..v_base_count LOOP

        v_current_position := array_position(
            v_sequence_keys,
            v_base_keys[v_i]
        );


        IF v_current_position IS NULL
           OR v_current_position <= v_previous_base_position
        THEN

            RAISE EXCEPTION
                'The proposed sequence must retain all original route locations in their original order.';

        END IF;


        IF v_i = 1 THEN
            v_first_base_position := v_current_position;
        END IF;


        v_last_base_position := v_current_position;

        v_previous_base_position := v_current_position;

    END LOOP;


    IF p_proposal_type = 'remove_points' THEN

        IF v_added_count <> 0 THEN
            RAISE EXCEPTION
                'A removal-only proposal cannot introduce new locations.';
        END IF;

    ELSIF v_added_count < 1 THEN

        RAISE EXCEPTION
            'A route-change proposal must add at least one location unless it is a removal-only proposal.';

    END IF;


    -- ========================================================
    -- K. VALIDATE PROPOSAL TYPE
    -- ========================================================

    IF p_proposal_type = 'insert_point' THEN

        -- At least one added location must occur between
        -- two original route locations.

        FOR v_i IN 1..v_point_count LOOP

            IF v_i > v_first_base_position
               AND v_i < v_last_base_position
               AND NOT (v_sequence_keys[v_i] = ANY(v_base_keys))
            THEN

                v_internal_added_count :=
                    v_internal_added_count + 1;

            END IF;

        END LOOP;


        IF v_internal_added_count < 1 THEN
            RAISE EXCEPTION
                'An insertion proposal must add a location between existing route locations.';
        END IF;


    ELSIF p_proposal_type = 'extend_route' THEN

        -- Original route locations must form one continuous
        -- block in the proposed sequence.
        --
        -- Additional locations may only be placed before
        -- or after that original block.

        IF (
            v_last_base_position
            - v_first_base_position
            + 1
        ) <> v_base_count THEN

            RAISE EXCEPTION
                'An extension proposal cannot insert locations between existing route locations.';

        END IF;

    ELSIF p_proposal_type = 'remove_points' THEN

        -- The lifecycle wrapper marks one or more original points for
        -- removal after this canonical snapshot has been created. The
        -- canonical point list itself must remain the unchanged original
        -- route sequence and must not contain newly created locations.
        IF v_added_count <> 0 OR v_point_count <> v_base_count THEN
            RAISE EXCEPTION
                'A removal-only proposal must preserve the complete original route without adding locations.';
        END IF;

    END IF;


    -- ========================================================
    -- L. RETURN SUBMISSION RESULT
    -- ========================================================

    RETURN pg_catalog.jsonb_build_object(

        'proposal_id',
        v_proposal_id,

        'route_id',
        p_route_id,

        'proposal_type',
        p_proposal_type,

        'moderation_status',
        'pending',

        'point_count',
        v_point_count,

        'created_point_count',
        (
            SELECT count(*)::integer
            FROM public.route_change_proposal_points AS proposal_point
            WHERE proposal_point.proposal_id = v_proposal_id
              AND proposal_point.is_new_point IS TRUE
        ),

        'points',
        v_result_points

    );


END;

$function$;

REVOKE ALL ON FUNCTION public.submit_route_change_proposal(bigint, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_route_change_proposal(bigint, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_route_change_proposal_with_lifecycle_edits(
  p_route_id bigint,
  p_proposal_type text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_clean_payload jsonb;
  v_clean_point_edits jsonb;
  v_point_edits jsonb;
  v_edit jsonb;
  v_result jsonb;
  v_proposal_id bigint;
  v_stop_order integer;
  v_replaces_stop_order integer;
  v_is_removed boolean;
  v_is_new_point boolean;
  v_terminal_id bigint;
  v_stop_id bigint;
  v_route_transport_type_id bigint;
  v_route_fare_model text;
  v_old_point_transport_type_id bigint;
  v_new_point_transport_type_id bigint;
  v_old_stop_type text;
  v_new_stop_type text;
  v_old_is_terminal boolean;
  v_new_is_terminal boolean;
  v_remarks text;
  v_point_count integer;
  v_removed_count integer := 0;
  v_replacement_count integer := 0;
  v_active_count integer;
  v_active_distinct_orders integer;
  v_active_min_order integer;
  v_active_max_order integer;
  v_updated_count integer;
  v_removed_orders integer[] := ARRAY[]::integer[];
  v_replacement_targets integer[] := ARRAY[]::integer[];
  v_base_keys text[];
  v_sequence_keys text[];
  v_base_count integer;
  v_first_base_position integer;
  v_last_base_position integer;
  v_internal_added_count integer := 0;
  v_extension_added_count integer := 0;
  v_leading_added_count integer := 0;
  v_i integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_proposal_type NOT IN ('insert_point', 'extend_route', 'combined', 'remove_points') THEN
    RAISE EXCEPTION 'Invalid route-change proposal type.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'A valid route-change proposal payload is required.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_payload) AS payload_key(key)
    WHERE payload_key.key NOT IN (
      'proposed_name',
      'points',
      'point_edits',
      'contributor_remarks'
    )
  ) THEN
    RAISE EXCEPTION 'The route-change proposal contains unsupported fields.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_payload -> 'points') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(p_payload -> 'point_edits') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'The complete route sequence and point edits are required.'
      USING ERRCODE = '22023';
  END IF;

  v_point_edits := p_payload -> 'point_edits';
  IF p_payload ? 'contributor_remarks'
     AND pg_catalog.jsonb_typeof(p_payload -> 'contributor_remarks') NOT IN ('string', 'null')
  THEN
    RAISE EXCEPTION 'Contributor remarks must be text or null.'
      USING ERRCODE = '22023';
  END IF;

  v_remarks := NULLIF(pg_catalog.btrim(COALESCE(p_payload ->> 'contributor_remarks', '')), '');
  IF v_remarks IS NOT NULL AND pg_catalog.char_length(v_remarks) > 1000 THEN
    RAISE EXCEPTION 'Contributor remarks cannot exceed 1,000 characters.'
      USING ERRCODE = '22023';
  END IF;

  -- Strip lifecycle-only fields before delegating to the established
  -- coordinate/name/order wrapper. The legacy proposal RPC currently
  -- recognizes insert_point and extend_route. A combined proposal is
  -- submitted through its insertion validation first (which requires an
  -- internal insertion); we then validate the extension and persist the
  -- combined type in this same transaction.
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      edit_row.edit_value - 'remove_from_route' - 'replaces_stop_order'
      ORDER BY edit_row.ordinality
    ),
    '[]'::pg_catalog.jsonb
  )
  INTO v_clean_point_edits
  FROM pg_catalog.jsonb_array_elements(v_point_edits)
    WITH ORDINALITY AS edit_row(edit_value, ordinality);

  v_clean_payload := pg_catalog.jsonb_build_object(
    'points', p_payload -> 'points',
    'point_edits', v_clean_point_edits
  );

  IF p_payload ? 'proposed_name' THEN
    v_clean_payload := v_clean_payload
      || pg_catalog.jsonb_build_object('proposed_name', p_payload -> 'proposed_name');
  END IF;

  v_result := public.submit_route_change_proposal_with_edits(
    p_route_id,
    CASE WHEN p_proposal_type = 'combined' THEN 'insert_point' ELSE p_proposal_type END,
    v_clean_payload
  );

  v_proposal_id := (v_result ->> 'proposal_id')::bigint;

  SELECT pg_catalog.count(*)::integer
  INTO v_point_count
  FROM public.route_change_proposal_points AS proposal_point
  WHERE proposal_point.proposal_id = v_proposal_id;

  IF v_point_count < 2
     OR pg_catalog.jsonb_array_length(v_point_edits) <> v_point_count
  THEN
    RAISE EXCEPTION 'Every canonical route point must have exactly one lifecycle edit.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_edit IN
    SELECT edit_value
    FROM pg_catalog.jsonb_array_elements(v_point_edits) AS edit_row(edit_value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_edit) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Every point lifecycle edit must be an object.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(v_edit) AS edit_key(key)
      WHERE edit_key.key NOT IN (
        'stop_order',
        'proposed_stop_order',
        'proposed_name',
        'latitude',
        'longitude',
        'remove_from_route',
        'replaces_stop_order'
      )
    ) THEN
      RAISE EXCEPTION 'A point lifecycle edit contains unsupported fields.'
        USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v_edit -> 'stop_order') IS DISTINCT FROM 'number'
       OR (v_edit ->> 'stop_order') !~ '^[1-9][0-9]*$'
    THEN
      RAISE EXCEPTION 'A point lifecycle edit needs a canonical sequence number.'
        USING ERRCODE = '22023';
    END IF;

    v_stop_order := (v_edit ->> 'stop_order')::integer;
    v_is_removed := false;
    IF v_edit ? 'remove_from_route' THEN
      IF pg_catalog.jsonb_typeof(v_edit -> 'remove_from_route') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'remove_from_route must be a boolean.'
          USING ERRCODE = '22023';
      END IF;
      v_is_removed := (v_edit ->> 'remove_from_route')::boolean;
    END IF;

    v_replaces_stop_order := NULL;
    IF v_edit ? 'replaces_stop_order' THEN
      IF pg_catalog.jsonb_typeof(v_edit -> 'replaces_stop_order') IS DISTINCT FROM 'number'
         OR (v_edit ->> 'replaces_stop_order') !~ '^[1-9][0-9]*$'
      THEN
        RAISE EXCEPTION 'replaces_stop_order must be a positive sequence number.'
          USING ERRCODE = '22023';
      END IF;
      v_replaces_stop_order := (v_edit ->> 'replaces_stop_order')::integer;
    END IF;

    SELECT
      proposal_point.is_new_point,
      proposal_point.terminal_id,
      proposal_point.stop_id
    INTO
      v_is_new_point,
      v_terminal_id,
      v_stop_id
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = v_proposal_id
      AND proposal_point.stop_order = v_stop_order;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A lifecycle edit does not match a canonical proposal point.'
        USING ERRCODE = '22023';
    END IF;

    IF v_removed_count > v_point_count THEN
      RAISE EXCEPTION 'The number of replaced locations exceeds the proposal size.'
        USING ERRCODE = '22023';
    END IF;

    IF v_is_removed THEN
      IF v_is_new_point IS TRUE
         OR (v_terminal_id IS NULL AND v_stop_id IS NULL)
         OR (v_terminal_id IS NOT NULL AND v_stop_id IS NOT NULL)
         OR v_edit ? 'proposed_name'
         OR v_edit ? 'latitude'
         OR v_edit ? 'longitude'
      THEN
        RAISE EXCEPTION
          'Only an existing route location can be marked for removal.'
          USING ERRCODE = '22023';
      END IF;

      v_removed_orders := pg_catalog.array_append(v_removed_orders, v_stop_order);
      v_removed_count := v_removed_count + 1;

      UPDATE public.route_change_proposal_points AS proposal_point
      SET
        is_removed_from_route = true,
        proposed_stop_order = 0
      WHERE proposal_point.proposal_id = v_proposal_id
        AND proposal_point.stop_order = v_stop_order
        AND proposal_point.is_new_point IS FALSE
        AND (
          proposal_point.terminal_id IS NOT NULL
          OR proposal_point.stop_id IS NOT NULL
        );

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'Unable to mark the original route location for replacement.'
          USING ERRCODE = '40001';
      END IF;
    END IF;

    IF v_replaces_stop_order IS NOT NULL THEN
      IF v_is_new_point IS NOT TRUE
         OR (v_terminal_id IS NULL AND v_stop_id IS NULL)
         OR (v_terminal_id IS NOT NULL AND v_stop_id IS NOT NULL)
         OR v_replaces_stop_order = v_stop_order
      THEN
        RAISE EXCEPTION 'Only a newly proposed terminal or stop can replace an existing route location.'
          USING ERRCODE = '22023';
      END IF;

      IF v_replaces_stop_order = ANY(v_replacement_targets) THEN
        RAISE EXCEPTION 'An original route location can only be replaced once in a proposal.'
          USING ERRCODE = '22023';
      END IF;
      v_replacement_targets := pg_catalog.array_append(v_replacement_targets, v_replaces_stop_order);
      v_replacement_count := v_replacement_count + 1;

      SELECT
        route_row.transport_type_id,
        route_variant.fare_model::text,
        COALESCE(original_terminal.transport_type_id, original_stop.transport_type_id),
        original_stop.stop_type,
        COALESCE(replacement_terminal.transport_type_id, replacement_stop.transport_type_id),
        replacement_stop.stop_type,
        original_point.terminal_id IS NOT NULL,
        replacement_point.terminal_id IS NOT NULL
      INTO
        v_route_transport_type_id,
        v_route_fare_model,
        v_old_point_transport_type_id,
        v_old_stop_type,
        v_new_point_transport_type_id,
        v_new_stop_type,
        v_old_is_terminal,
        v_new_is_terminal
      FROM public.route_change_proposal_points AS original_point
      JOIN public.route_change_proposal_points AS replacement_point
        ON replacement_point.proposal_id = original_point.proposal_id
       AND replacement_point.stop_order = v_stop_order
      JOIN public.routes AS route_row
        ON route_row.id = p_route_id
      JOIN public.transport_variants AS route_variant
        ON route_variant.id = route_row.variant_id
       AND route_variant.transport_type_id = route_row.transport_type_id
      LEFT JOIN public.terminals AS original_terminal
        ON original_terminal.id = original_point.terminal_id
      LEFT JOIN public.stops AS original_stop
        ON original_stop.id = original_point.stop_id
      LEFT JOIN public.terminals AS replacement_terminal
        ON replacement_terminal.id = replacement_point.terminal_id
      LEFT JOIN public.stops AS replacement_stop
        ON replacement_stop.id = replacement_point.stop_id
      WHERE original_point.proposal_id = v_proposal_id
        AND original_point.stop_order = v_replaces_stop_order
        AND original_point.is_new_point IS FALSE
        AND replacement_point.is_new_point IS TRUE
        AND (
          (original_point.terminal_id IS NOT NULL AND original_point.stop_id IS NULL)
          OR (original_point.terminal_id IS NULL AND original_point.stop_id IS NOT NULL)
        );

      IF NOT FOUND
         OR v_route_fare_model IS DISTINCT FROM 'distance'
         OR v_old_point_transport_type_id IS DISTINCT FROM v_route_transport_type_id
         OR v_new_point_transport_type_id IS DISTINCT FROM v_route_transport_type_id
      THEN
        RAISE EXCEPTION
          'Terminal/stop conversions require a distance-based route and locations compatible with its vehicle type.'
          USING ERRCODE = '22023';
      END IF;

      -- A conversion must change kind, not merely replace a location with
      -- another location of the same kind. Train/matrix routes remain stations-only.
      IF v_old_is_terminal IS TRUE THEN
        IF v_new_is_terminal IS TRUE OR v_new_stop_type IS DISTINCT FROM 'road_stop' THEN
          RAISE EXCEPTION
            'An existing terminal can only be converted into a new road stop.'
            USING ERRCODE = '22023';
        END IF;
      ELSE
        IF v_old_stop_type IS DISTINCT FROM 'road_stop'
           OR v_new_is_terminal IS NOT TRUE
        THEN
          RAISE EXCEPTION
            'An existing road stop can only be converted into a new terminal.'
            USING ERRCODE = '22023';
        END IF;
      END IF;


      UPDATE public.route_change_proposal_points AS proposal_point
      SET replaces_stop_order = v_replaces_stop_order
      WHERE proposal_point.proposal_id = v_proposal_id
        AND proposal_point.stop_order = v_stop_order
        AND proposal_point.is_new_point IS TRUE
        AND (
          (v_terminal_id IS NOT NULL AND proposal_point.terminal_id = v_terminal_id)
          OR (v_stop_id IS NOT NULL AND proposal_point.stop_id = v_stop_id)
        );

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'Unable to link the proposed replacement location to the original route location.'
          USING ERRCODE = '40001';
      END IF;
    END IF;
  END LOOP;

  -- Every conversion replacement must point to a location explicitly
  -- marked for removal. Unpaired removals are genuine deletion requests.
  IF EXISTS (
    SELECT replacement_order
    FROM pg_catalog.unnest(v_replacement_targets) AS replacement(replacement_order)
    EXCEPT
    SELECT removed_order
    FROM pg_catalog.unnest(v_removed_orders) AS removed(removed_order)
  ) THEN
    RAISE EXCEPTION 'A conversion replacement does not match a location marked for removal.'
      USING ERRCODE = '22023';
  END IF;

  IF p_proposal_type = 'remove_points' THEN
    IF v_removed_count < 1
       OR v_replacement_count <> 0
       OR EXISTS (
         SELECT 1
         FROM public.route_change_proposal_points AS proposal_point
         WHERE proposal_point.proposal_id = v_proposal_id
           AND proposal_point.is_new_point IS TRUE
       )
    THEN
      RAISE EXCEPTION 'A removal-only proposal must remove at least one existing location and cannot add or replace locations.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT proposal_point.proposed_stop_order)::integer,
    pg_catalog.min(proposal_point.proposed_stop_order),
    pg_catalog.max(proposal_point.proposed_stop_order)
  INTO
    v_active_count,
    v_active_distinct_orders,
    v_active_min_order,
    v_active_max_order
  FROM public.route_change_proposal_points AS proposal_point
  WHERE proposal_point.proposal_id = v_proposal_id
    AND proposal_point.is_removed_from_route IS FALSE;

  IF v_active_count < 2
     OR v_active_distinct_orders <> v_active_count
     OR v_active_min_order <> 1
     OR v_active_max_order <> v_active_count
  THEN
    RAISE EXCEPTION 'The final active route sequence must contain at least two points numbered consecutively from 1.'
      USING ERRCODE = '22023';
  END IF;

  -- Distance-based routes may contain terminals at any sequence position.
  -- Transport type and location compatibility are checked above and again
  -- during moderator revalidation before the route is synchronized.

  IF p_proposal_type = 'combined' THEN
    SELECT array_agg(
      CASE
        WHEN snapshot_point.point_value ->> 'kind' = 'terminal'
          THEN 'terminal:' || (snapshot_point.point_value ->> 'location_id')
        ELSE 'stop:' || (snapshot_point.point_value ->> 'location_id')
      END
      ORDER BY snapshot_point.ordinality
    )
    INTO v_base_keys
    FROM public.route_change_proposals AS proposal
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      proposal.base_route_snapshot -> 'route_stops'
    ) WITH ORDINALITY AS snapshot_point(point_value, ordinality)
    WHERE proposal.id = v_proposal_id;

    SELECT array_agg(
      CASE
        WHEN proposal_point.terminal_id IS NOT NULL
          THEN 'terminal:' || proposal_point.terminal_id::text
        ELSE 'stop:' || proposal_point.stop_id::text
      END
      ORDER BY proposal_point.stop_order
    )
    INTO v_sequence_keys
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = v_proposal_id;

    v_base_count := COALESCE(cardinality(v_base_keys), 0);
    IF v_base_count < 2 OR cardinality(v_sequence_keys) <> v_point_count THEN
      RAISE EXCEPTION 'The combined proposal does not contain a complete original route snapshot.'
        USING ERRCODE = '22023';
    END IF;

    v_first_base_position := pg_catalog.array_position(v_sequence_keys, v_base_keys[1]);
    v_last_base_position := pg_catalog.array_position(v_sequence_keys, v_base_keys[v_base_count]);
    IF v_first_base_position IS NULL OR v_last_base_position IS NULL
       OR v_last_base_position <= v_first_base_position
    THEN
      RAISE EXCEPTION 'The combined proposal does not preserve the original route sequence.'
        USING ERRCODE = '22023';
    END IF;

    v_internal_added_count := 0;
    v_extension_added_count := 0;
    v_leading_added_count := 0;
    FOR v_i IN 1..v_point_count LOOP
      IF NOT (v_sequence_keys[v_i] = ANY(v_base_keys)) THEN
        IF v_i < v_first_base_position THEN
          v_leading_added_count := v_leading_added_count + 1;
        ELSIF v_i > v_first_base_position AND v_i < v_last_base_position THEN
          v_internal_added_count := v_internal_added_count + 1;
        ELSIF v_i > v_last_base_position THEN
          v_extension_added_count := v_extension_added_count + 1;
        END IF;
      END IF;
    END LOOP;

    IF v_internal_added_count < 1
       OR v_extension_added_count < 1
       OR v_leading_added_count > 0
    THEN
      RAISE EXCEPTION 'A combined proposal must contain an internal insertion and an extension after the final original location, with no additions before the starting location.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.route_change_proposals AS proposal
  SET
    proposal_type = p_proposal_type,
    contributor_remarks = v_remarks
  WHERE proposal.id = v_proposal_id
    AND proposal.contributor_id = v_actor
    AND proposal.status = 'pending';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'The pending route proposal could not store its proposal type and contributor remarks.'
      USING ERRCODE = '40001';
  END IF;

  RETURN v_result || pg_catalog.jsonb_build_object('proposal_type', p_proposal_type);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_route_change_proposal_with_lifecycle_edits(bigint, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_route_change_proposal_with_lifecycle_edits(bigint, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_route_change_proposal(p_proposal_id bigint, p_action text, p_moderation_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

DECLARE

    v_actor uuid := auth.uid();
    v_role text;

    v_proposal public.route_change_proposals%ROWTYPE;
    v_route public.routes%ROWTYPE;

    v_moderator_display_name text;
    v_moderator_username text;

    v_category_id uuid;

    v_current_snapshot jsonb;
    v_proposed_sequence jsonb;

    v_base_keys text[];
    v_proposed_keys text[];

    v_fare_model text;

    v_final_status text;
    v_final_note text;
    v_location_note text;

    v_point_count integer;
    v_base_count integer;

    v_expected_new_stops integer;
    v_expected_new_terminals integer;

    v_updated_count integer;

    v_points_invalid boolean := false;

    v_first_base_position integer;
    v_last_base_position integer;
    v_previous_base_position integer := 0;
    v_current_position integer;

    v_internal_added_count integer := 0;
    v_extension_added_count integer := 0;
    v_leading_added_count integer := 0;

    v_i integer;

    v_sync_result jsonb;
    v_applied_at timestamptz;

    v_action_key text;
    v_action_title text;
    v_action_description text;
    v_route_label text;

BEGIN

    -- ========================================================
    -- A. AUTHENTICATION
    -- ========================================================

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Authentication required.'
            USING ERRCODE = '42501';
    END IF;


    SELECT role_row.role::text
    INTO v_role
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = v_actor;


    IF v_role IS NULL
       OR v_role NOT IN ('admin', 'moderator')
    THEN
        RAISE EXCEPTION 'Route Management access required.'
            USING ERRCODE = '42501';
    END IF;


    -- ========================================================
    -- B. REQUEST VALIDATION
    -- ========================================================

    IF p_proposal_id IS NULL OR p_proposal_id < 1 THEN
        RAISE EXCEPTION 'A valid proposal ID is required.'
            USING ERRCODE = '22023';
    END IF;


    IF p_action IS NULL
       OR p_action NOT IN ('approve', 'reject')
    THEN
        RAISE EXCEPTION 'Only approve and reject actions are supported.'
            USING ERRCODE = '22023';
    END IF;


    IF p_moderation_note IS NOT NULL
       AND pg_catalog.char_length(p_moderation_note) > 500
    THEN
        RAISE EXCEPTION 'Moderation notes cannot exceed 500 characters.'
            USING ERRCODE = '22023';
    END IF;


    v_final_note := NULLIF(
        pg_catalog.left(
            pg_catalog.btrim(
                COALESCE(p_moderation_note, '')
            ),
            500
        ),
        ''
    );


    -- ========================================================
    -- C. SERIALIZE ROUTE-MANAGEMENT MUTATIONS
    -- ========================================================

    PERFORM pg_catalog.pg_advisory_xact_lock(
        913713,
        42001
    );


    -- ========================================================
    -- D. LOCK PROPOSAL
    -- ========================================================

    SELECT *
    INTO v_proposal
    FROM public.route_change_proposals AS proposal
    WHERE proposal.id = p_proposal_id
    FOR UPDATE;


    IF NOT FOUND THEN
        RAISE EXCEPTION 'Route-change proposal not found.'
            USING ERRCODE = 'P0002';
    END IF;


    IF v_proposal.status <> 'pending' THEN
        RAISE EXCEPTION 'This proposal is no longer pending.'
            USING ERRCODE = 'P0002';
    END IF;


    -- ========================================================
    -- E. LOCK TARGET ROUTE
    -- ========================================================

    SELECT *
    INTO v_route
    FROM public.routes AS route_row
    WHERE route_row.id = v_proposal.route_id
    FOR UPDATE;


    IF NOT FOUND THEN
        RAISE EXCEPTION 'The target route no longer exists.'
            USING ERRCODE = 'P0002';
    END IF;


    v_route_label := COALESCE(
        NULLIF(pg_catalog.btrim(v_proposal.proposed_name), ''),
        v_route.name,
        'Route ' || v_route.id::text
    );


    -- ========================================================
    -- F. LOCK PROPOSAL LOCATIONS
    -- ========================================================

    PERFORM stop_row.id

    FROM public.stops AS stop_row

    JOIN public.route_change_proposal_points AS proposal_point
        ON proposal_point.stop_id = stop_row.id

    WHERE proposal_point.proposal_id = p_proposal_id

    ORDER BY stop_row.id

    FOR UPDATE OF stop_row;


    PERFORM terminal_row.id

    FROM public.terminals AS terminal_row

    JOIN public.route_change_proposal_points AS proposal_point
        ON proposal_point.terminal_id = terminal_row.id

    WHERE proposal_point.proposal_id = p_proposal_id

    ORDER BY terminal_row.id

    FOR UPDATE OF terminal_row;


    -- ========================================================
    -- G. REVIEWER IDENTITY
    -- ========================================================

    SELECT

        COALESCE(
            NULLIF(pg_catalog.btrim(profile.display_name), ''),
            NULLIF(pg_catalog.btrim(profile.username), ''),
            CASE
                WHEN v_role = 'moderator' THEN 'Moderator'
                ELSE 'Administrator'
            END
        ),

        profile.username

    INTO

        v_moderator_display_name,
        v_moderator_username

    FROM public.profiles AS profile

    WHERE profile.id = v_actor;


    IF NOT FOUND THEN

        v_moderator_display_name :=
            CASE
                WHEN v_role = 'moderator' THEN 'Moderator'
                ELSE 'Administrator'
            END;

        v_moderator_username := NULL;

    END IF;


    -- ========================================================
    -- H. AUDIT CATEGORY
    -- ========================================================

    SELECT category.id
    INTO v_category_id

    FROM public.admin_action_categories AS category

    WHERE category.category_key = 'route_management'
      AND category.is_active IS TRUE;


    IF v_category_id IS NULL THEN
        RAISE EXCEPTION
            'The Route Management audit category is unavailable.';
    END IF;


    -- ========================================================
    -- I. CURRENT ROUTE SNAPSHOT
    -- ========================================================

    SELECT

        pg_catalog.jsonb_build_object(

            'route_id',
            route_row.id,

            'name',
            route_row.name,

            'transport_type_id',
            route_row.transport_type_id,

            'variant_id',
            route_row.variant_id,

            'route_stops',

            COALESCE(

                (
                    SELECT pg_catalog.jsonb_agg(

                        pg_catalog.jsonb_build_object(

                            'route_stop_id',
                            route_stop.id,

                            'stop_order',
                            route_stop.stop_order,

                            'kind',

                            CASE
                                WHEN route_stop.terminal_id IS NOT NULL
                                    THEN 'terminal'
                                ELSE 'stop'
                            END,

                            'location_id',

                            COALESCE(
                                route_stop.terminal_id,
                                route_stop.stop_id
                            ),

                            'location_name',

                            COALESCE(
                                terminal_row.name,
                                stop_row.name
                            )

                        )

                        ORDER BY route_stop.stop_order

                    )

                    FROM public.route_stops AS route_stop

                    LEFT JOIN public.terminals AS terminal_row
                        ON terminal_row.id = route_stop.terminal_id

                    LEFT JOIN public.stops AS stop_row
                        ON stop_row.id = route_stop.stop_id

                    WHERE route_stop.route_id = route_row.id
                ),

                '[]'::jsonb

            )

        )

    INTO v_current_snapshot

    FROM public.routes AS route_row

    WHERE route_row.id = v_proposal.route_id;


    -- ========================================================
    -- J. PROPOSED SEQUENCE
    -- ========================================================

    SELECT

        pg_catalog.jsonb_agg(

            pg_catalog.jsonb_build_object(

                'kind',

                CASE
                    WHEN proposal_point.terminal_id IS NOT NULL
                        THEN 'terminal'
                    ELSE 'stop'
                END,

                'id',

                COALESCE(
                    proposal_point.terminal_id,
                    proposal_point.stop_id
                )

            )

            ORDER BY proposal_point.stop_order

        ),

        pg_catalog.array_agg(

            CASE
                WHEN proposal_point.terminal_id IS NOT NULL
                    THEN 'terminal:' || proposal_point.terminal_id::text
                ELSE 'stop:' || proposal_point.stop_id::text
            END

            ORDER BY proposal_point.stop_order

        )

    INTO
        v_proposed_sequence,
        v_proposed_keys

    FROM public.route_change_proposal_points AS proposal_point

    WHERE proposal_point.proposal_id = p_proposal_id;


    -- ========================================================
    -- K. DETERMINE MODERATION RESULT
    -- ========================================================

    IF p_action = 'reject' THEN

        v_final_status := 'rejected';

    ELSE

        -- ----------------------------------------------------
        -- K1. Route must remain active and approved.
        -- ----------------------------------------------------

        IF v_route.is_approved IS NOT TRUE

           OR v_route.moderation_status
                IS DISTINCT FROM 'approved'

           OR v_route.is_active IS NOT TRUE

           OR COALESCE(v_route.is_deleted, false)

           OR COALESCE(v_route.is_banned, false)

        THEN

            v_final_status := 'conflicted';

            v_final_note := COALESCE(
                v_final_note,
                'The target route is no longer active and approved.'
            );


        -- ----------------------------------------------------
        -- K2. Detect modification to the original route.
        -- ----------------------------------------------------

        ELSIF v_current_snapshot
            IS DISTINCT FROM v_proposal.base_route_snapshot
        THEN

            v_final_status := 'conflicted';

            v_final_note := COALESCE(
                v_final_note,
                'The target route changed after this proposal was submitted. A new proposal is required.'
            );


        ELSE

            -- -----------------------------------------------
            -- K3. Load current original sequence.
            -- -----------------------------------------------

            SELECT

                pg_catalog.count(*)::integer,

                pg_catalog.array_agg(

                    CASE
                        WHEN route_stop.terminal_id IS NOT NULL
                            THEN 'terminal:' || route_stop.terminal_id::text
                        ELSE 'stop:' || route_stop.stop_id::text
                    END

                    ORDER BY route_stop.stop_order

                )

            INTO
                v_base_count,
                v_base_keys

            FROM public.route_stops AS route_stop

            WHERE route_stop.route_id = v_proposal.route_id;


            SELECT variant_row.fare_model::text

            INTO v_fare_model

            FROM public.transport_variants AS variant_row

            WHERE variant_row.id = v_route.variant_id

              AND variant_row.transport_type_id =
                  v_route.transport_type_id

              AND variant_row.is_active IS TRUE;


            IF NOT FOUND THEN

                v_final_status := 'conflicted';

                v_final_note := COALESCE(
                    v_final_note,
                    'The route transport configuration is no longer available.'
                );


            ELSE

                -- -------------------------------------------
                -- K4. Validate proposed sequence size/order.
                -- -------------------------------------------

                SELECT pg_catalog.count(*)::integer

                INTO v_point_count

                FROM public.route_change_proposal_points

                WHERE proposal_id = p_proposal_id;


                IF v_point_count < 2
                   OR v_point_count > 100

                   OR COALESCE(
                       pg_catalog.array_length(v_base_keys, 1),
                       0
                   ) < 2

                   OR COALESCE(
                       pg_catalog.array_length(v_proposed_keys, 1),
                       0
                   ) <> v_point_count

                THEN

                    v_final_status := 'conflicted';

                    v_final_note := COALESCE(
                        v_final_note,
                        'The proposed route sequence is incomplete or invalid.'
                    );


                ELSE

                    -- ---------------------------------------
                    -- K5. Preserve every original location
                    --     and its original relative order.
                    -- ---------------------------------------

                    FOR v_i IN 1..v_base_count LOOP

                        v_current_position :=
                            pg_catalog.array_position(
                                v_proposed_keys,
                                v_base_keys[v_i]
                            );


                        IF v_current_position IS NULL

                           OR v_current_position
                                <= v_previous_base_position
                        THEN

                            v_final_status := 'conflicted';

                            v_final_note := COALESCE(
                                v_final_note,
                                'The proposed sequence no longer preserves the original route locations and order.'
                            );

                            EXIT;

                        END IF;


                        IF v_i = 1 THEN
                            v_first_base_position :=
                                v_current_position;
                        END IF;


                        v_last_base_position :=
                            v_current_position;

                        v_previous_base_position :=
                            v_current_position;

                    END LOOP;


                    -- ---------------------------------------
                    -- K6. Revalidate proposal type semantics.
                    -- ---------------------------------------

                    IF v_final_status IS NULL THEN

                        -- Revalidate the active route size for every proposal
                        -- that marks any original location for removal, including
                        -- insertion/extension/conversion proposals with mixed edits.
                        IF EXISTS (
                            SELECT 1
                            FROM public.route_change_proposal_points AS proposal_point
                            WHERE proposal_point.proposal_id = p_proposal_id
                              AND proposal_point.is_removed_from_route IS TRUE
                        ) AND (
                            (
                                SELECT pg_catalog.count(*)
                                FROM public.route_change_proposal_points AS proposal_point
                                WHERE proposal_point.proposal_id = p_proposal_id
                                  AND proposal_point.is_removed_from_route IS FALSE
                            ) < 2
                            OR EXISTS (
                                SELECT 1
                                FROM public.route_change_proposal_points AS proposal_point
                                WHERE proposal_point.proposal_id = p_proposal_id
                                  AND proposal_point.is_removed_from_route IS TRUE
                                  AND proposal_point.is_new_point IS TRUE
                            )
                        ) THEN
                            v_final_status := 'conflicted';
                            v_final_note := COALESCE(
                                v_final_note,
                                'A proposal with removals must leave at least two active route locations and can only mark original locations for removal.'
                            );

                        ELSIF v_proposal.proposal_type = 'extend_route' THEN

                            IF (
                                v_last_base_position
                                - v_first_base_position
                                + 1
                            ) <> v_base_count THEN

                                v_final_status := 'conflicted';

                                v_final_note := COALESCE(
                                    v_final_note,
                                    'An extension proposal must preserve the original route as one continuous sequence.'
                                );

                            END IF;


                        ELSIF v_proposal.proposal_type = 'insert_point' THEN

                            v_internal_added_count := 0;

                            FOR v_i IN 1..v_point_count LOOP

                                IF v_i > v_first_base_position

                                   AND v_i < v_last_base_position

                                   AND NOT (
                                       v_proposed_keys[v_i]
                                       = ANY(v_base_keys)
                                   )
                                THEN

                                    v_internal_added_count :=
                                        v_internal_added_count + 1;

                                END IF;

                            END LOOP;


                            IF v_internal_added_count < 1 THEN

                                v_final_status := 'conflicted';

                                v_final_note := COALESCE(
                                    v_final_note,
                                    'An insertion proposal must insert at least one location between original route locations.'
                                );

                            END IF;

                        ELSIF v_proposal.proposal_type = 'remove_points' THEN

                            IF NOT EXISTS (
                                SELECT 1
                                FROM public.route_change_proposal_points AS proposal_point
                                WHERE proposal_point.proposal_id = p_proposal_id
                                  AND proposal_point.is_removed_from_route IS TRUE
                                  AND proposal_point.is_new_point IS FALSE
                            )
                               OR EXISTS (
                                SELECT 1
                                FROM public.route_change_proposal_points AS proposal_point
                                WHERE proposal_point.proposal_id = p_proposal_id
                                  AND proposal_point.is_new_point IS TRUE
                            )
                               OR (
                                SELECT pg_catalog.count(*)
                                FROM public.route_change_proposal_points AS proposal_point
                                WHERE proposal_point.proposal_id = p_proposal_id
                                  AND proposal_point.is_removed_from_route IS FALSE
                            ) < 2
                            THEN
                                v_final_status := 'conflicted';
                                v_final_note := COALESCE(
                                    v_final_note,
                                    'A removal proposal must remove at least one existing location, add no replacement points, and leave at least two route locations.'
                                );
                            END IF;

                        ELSIF v_proposal.proposal_type = 'combined' THEN

                            v_internal_added_count := 0;
                            v_extension_added_count := 0;
                            v_leading_added_count := 0;

                            FOR v_i IN 1..v_point_count LOOP

                                IF NOT (v_proposed_keys[v_i] = ANY(v_base_keys)) THEN

                                    IF v_i < v_first_base_position THEN
                                        v_leading_added_count :=
                                            v_leading_added_count + 1;
                                    ELSIF v_i > v_first_base_position
                                       AND v_i < v_last_base_position
                                    THEN
                                        v_internal_added_count :=
                                            v_internal_added_count + 1;
                                    ELSIF v_i > v_last_base_position THEN
                                        v_extension_added_count :=
                                            v_extension_added_count + 1;
                                    END IF;

                                END IF;

                            END LOOP;

                            IF v_internal_added_count < 1
                               OR v_extension_added_count < 1
                               OR v_leading_added_count > 0
                            THEN
                                v_final_status := 'conflicted';
                                v_final_note := COALESCE(
                                    v_final_note,
                                    'A combined proposal must include an internal insertion and an extension after the final original location, with no additions before the starting location.'
                                );
                            END IF;

                        ELSE

                            v_final_status := 'conflicted';

                            v_final_note := COALESCE(
                                v_final_note,
                                'Unsupported proposal type.'
                            );

                        END IF;

                    END IF;


                    -- ---------------------------------------
                    -- K7. Validate every proposed location.
                    -- ---------------------------------------

                    IF v_final_status IS NULL THEN

                        SELECT EXISTS (

                            SELECT 1

                            FROM public.route_change_proposal_points
                                AS proposal_point

                            LEFT JOIN public.terminals AS terminal_row
                                ON terminal_row.id =
                                    proposal_point.terminal_id

                            LEFT JOIN public.stops AS stop_row
                                ON stop_row.id =
                                    proposal_point.stop_id

                            WHERE proposal_point.proposal_id =
                                p_proposal_id

                              AND (

                                  (
                                      proposal_point.terminal_id IS NOT NULL

                                      AND (

                                          terminal_row.id IS NULL

                                          OR terminal_row.is_active
                                                IS NOT TRUE

                                          OR COALESCE(
                                              terminal_row.is_deleted,
                                              false
                                          )

                                          OR COALESCE(
                                              terminal_row.is_banned,
                                              false
                                          )

                                          OR terminal_row.transport_type_id
                                                IS DISTINCT FROM
                                                    v_route.transport_type_id

                                          OR v_fare_model = 'matrix'


                                          OR (

                                              proposal_point.is_new_point IS TRUE

                                              AND (

                                                  terminal_row.created_by
                                                      IS DISTINCT FROM
                                                          v_proposal.contributor_id

                                                  OR terminal_row.is_approved
                                                      IS DISTINCT FROM FALSE

                                                  OR terminal_row.moderation_status
                                                      IS DISTINCT FROM 'pending'

                                              )

                                          )


                                          OR (

                                              proposal_point.is_new_point IS FALSE

                                              AND (

                                                  terminal_row.is_approved
                                                      IS DISTINCT FROM TRUE

                                                  OR terminal_row.moderation_status
                                                      IS DISTINCT FROM 'approved'

                                              )

                                          )

                                      )

                                  )

                                  OR

                                  (
                                      proposal_point.stop_id IS NOT NULL

                                      AND (

                                          stop_row.id IS NULL

                                          OR stop_row.is_active
                                                IS NOT TRUE

                                          OR COALESCE(
                                              stop_row.is_deleted,
                                              false
                                          )

                                          OR COALESCE(
                                              stop_row.is_banned,
                                              false
                                          )

                                          OR stop_row.transport_type_id
                                                IS DISTINCT FROM
                                                    v_route.transport_type_id


                                          OR (

                                              v_fare_model = 'matrix'

                                              AND stop_row.stop_type
                                                    IS DISTINCT FROM
                                                        'train_station'

                                          )


                                          OR (

                                              v_fare_model = 'distance'

                                              AND stop_row.stop_type
                                                    IS DISTINCT FROM
                                                        'road_stop'

                                          )


                                          OR (

                                              proposal_point.is_new_point IS TRUE

                                              AND (

                                                  stop_row.created_by
                                                      IS DISTINCT FROM
                                                          v_proposal.contributor_id

                                                  OR stop_row.is_approved
                                                      IS DISTINCT FROM FALSE

                                                  OR stop_row.moderation_status
                                                      IS DISTINCT FROM 'pending'

                                              )

                                          )


                                          OR (

                                              proposal_point.is_new_point IS FALSE

                                              AND (

                                                  stop_row.is_approved
                                                      IS DISTINCT FROM TRUE

                                                  OR stop_row.moderation_status
                                                      IS DISTINCT FROM 'approved'

                                              )

                                          )

                                      )

                                  )

                              )

                        )

                        INTO v_points_invalid;


                        IF v_points_invalid THEN

                            v_final_status := 'conflicted';

                            v_final_note := COALESCE(
                                v_final_note,
                                'One or more proposed locations are no longer eligible or available.'
                            );

                        ELSE

                            -- -------------------------------
                            -- K8. Count new locations.
                            -- -------------------------------

                            SELECT

                                pg_catalog.count(*) FILTER (
                                    WHERE stop_id IS NOT NULL
                                )::integer,

                                pg_catalog.count(*) FILTER (
                                    WHERE terminal_id IS NOT NULL
                                )::integer

                            INTO

                                v_expected_new_stops,
                                v_expected_new_terminals

                            FROM public.route_change_proposal_points

                            WHERE proposal_id = p_proposal_id

                              AND is_new_point IS TRUE;


                            v_final_status := 'approved';

                            v_final_note := NULL;

                        END IF;

                    END IF;

                END IF;

            END IF;

        END IF;

    END IF;


    -- ========================================================
    -- L. UPDATE PROPOSAL STATUS
    -- ========================================================
    --
    -- Approval changes status before location approval.
    -- The Migration B guard therefore permits this operation.
    --
    -- If a later operation fails, this update rolls back.
    -- ========================================================

    UPDATE public.route_change_proposals

    SET

        status = v_final_status,

        moderation_note = v_final_note,

        moderated_by = v_actor,

        moderator_display_name =
            v_moderator_display_name,

        moderated_at = pg_catalog.clock_timestamp(),

        applied_at = NULL,

        updated_at = pg_catalog.clock_timestamp()

    WHERE id = p_proposal_id

      AND status = 'pending';


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'The proposal was modified by another operation.'

            USING ERRCODE = '40001';

    END IF;


    -- ========================================================
    -- M. APPLY APPROVED PROPOSAL
    -- ========================================================

    IF v_final_status = 'approved' THEN

        -- ----------------------------------------------------
        -- M1. Approve newly created stops.
        -- ----------------------------------------------------

        UPDATE public.stops AS stop_row

        SET

            is_approved = true,

            moderation_status = 'approved',

            moderation_note = NULL,

            moderated_by = v_actor,

            moderated_at = pg_catalog.clock_timestamp()

        FROM public.route_change_proposal_points AS proposal_point

        WHERE proposal_point.proposal_id = p_proposal_id

          AND proposal_point.stop_id = stop_row.id

          AND proposal_point.is_new_point IS TRUE

          AND stop_row.created_by =
              v_proposal.contributor_id

          AND stop_row.is_approved IS FALSE

          AND stop_row.moderation_status = 'pending'

          AND stop_row.is_active IS TRUE

          AND COALESCE(stop_row.is_deleted, false) IS FALSE

          AND COALESCE(stop_row.is_banned, false) IS FALSE;


        GET DIAGNOSTICS v_updated_count = ROW_COUNT;


        IF v_updated_count <> v_expected_new_stops THEN

            RAISE EXCEPTION
                'Not all newly proposed stops could be approved.'

                USING ERRCODE = '40001';

        END IF;


        -- ----------------------------------------------------
        -- M2. Approve newly created terminals.
        -- ----------------------------------------------------

        UPDATE public.terminals AS terminal_row

        SET

            is_approved = true,

            moderation_status = 'approved',

            moderation_note = NULL,

            moderated_by = v_actor,

            moderated_at = pg_catalog.clock_timestamp()

        FROM public.route_change_proposal_points AS proposal_point

        WHERE proposal_point.proposal_id = p_proposal_id

          AND proposal_point.terminal_id = terminal_row.id

          AND proposal_point.is_new_point IS TRUE

          AND terminal_row.created_by =
              v_proposal.contributor_id

          AND terminal_row.is_approved IS FALSE

          AND terminal_row.moderation_status = 'pending'

          AND terminal_row.is_active IS TRUE

          AND COALESCE(terminal_row.is_deleted, false) IS FALSE

          AND COALESCE(terminal_row.is_banned, false) IS FALSE;


        GET DIAGNOSTICS v_updated_count = ROW_COUNT;


        IF v_updated_count <> v_expected_new_terminals THEN

            RAISE EXCEPTION
                'Not all newly proposed terminals could be approved.'

                USING ERRCODE = '40001';

        END IF;


        -- ----------------------------------------------------
        -- M3. Apply proposed route name.
        -- ----------------------------------------------------

        IF v_proposal.proposed_name IS NOT NULL

           AND v_route.name
                IS DISTINCT FROM v_proposal.proposed_name
        THEN

            UPDATE public.routes

            SET name = v_proposal.proposed_name

            WHERE id = v_proposal.route_id;

        END IF;


        -- ----------------------------------------------------
        -- M4. Synchronize complete route sequence.
        -- ----------------------------------------------------

        v_sync_result :=
            route_management_internal.sync_route_stops(
                v_proposal.route_id,
                v_proposed_sequence
            );


        -- ----------------------------------------------------
        -- M5. Record successful application.
        -- ----------------------------------------------------

        v_applied_at := pg_catalog.clock_timestamp();


        UPDATE public.route_change_proposals

        SET

            applied_at = v_applied_at,

            updated_at = v_applied_at

        WHERE id = p_proposal_id;


    ELSE

        -- ====================================================
        -- N. REJECT NEWLY CREATED LOCATIONS
        -- ====================================================
        --
        -- This handles:
        --   - explicit rejection
        --   - automatic conflict detection
        --
        -- Existing approved locations are untouched.
        -- ====================================================

        v_location_note := COALESCE(
            v_final_note,
            CASE
                WHEN v_final_status = 'conflicted'
                    THEN 'The associated route-change proposal conflicted with the current route.'
                ELSE 'The associated route-change proposal was rejected.'
            END
        );


        UPDATE public.stops AS stop_row

        SET

            is_approved = false,

            moderation_status = 'rejected',

            moderation_note = v_location_note,

            moderated_by = v_actor,

            moderated_at = pg_catalog.clock_timestamp(),

            is_active = false

        FROM public.route_change_proposal_points AS proposal_point

        WHERE proposal_point.proposal_id = p_proposal_id

          AND proposal_point.stop_id = stop_row.id

          AND proposal_point.is_new_point IS TRUE

          AND stop_row.is_approved IS FALSE

          AND stop_row.moderation_status = 'pending'

          AND COALESCE(stop_row.is_deleted, false) IS FALSE;


        UPDATE public.terminals AS terminal_row

        SET

            is_approved = false,

            moderation_status = 'rejected',

            moderation_note = v_location_note,

            moderated_by = v_actor,

            moderated_at = pg_catalog.clock_timestamp(),

            is_active = false

        FROM public.route_change_proposal_points AS proposal_point

        WHERE proposal_point.proposal_id = p_proposal_id

          AND proposal_point.terminal_id = terminal_row.id

          AND proposal_point.is_new_point IS TRUE

          AND terminal_row.is_approved IS FALSE

          AND terminal_row.moderation_status = 'pending'

          AND COALESCE(terminal_row.is_deleted, false) IS FALSE;

    END IF;


    -- ========================================================
    -- O. PROPOSAL AUDIT EVENT
    -- ========================================================

    v_action_key :=
        'route_change_proposal_' || v_final_status;


    v_action_title :=
        pg_catalog.initcap(
            pg_catalog.replace(v_action_key, '_', ' ')
        );


    v_action_description :=

        CASE v_final_status

            WHEN 'approved' THEN
                'Approved and applied a route-change proposal.'

            WHEN 'rejected' THEN
                'Rejected a route-change proposal.'

            WHEN 'conflicted' THEN
                'Marked a route-change proposal as conflicted because its original route state or proposed locations changed.'

        END;


    INSERT INTO public.admin_audit_logs (

        admin_user_id,

        admin_display_name,

        admin_username,

        category_id,

        action_key,

        action_title,

        description,

        target_type,

        target_id,

        target_label,

        metadata

    )

    VALUES (

        v_actor,

        v_moderator_display_name,

        v_moderator_username,

        v_category_id,

        v_action_key,

        v_action_title,

        v_action_description,

        'route_change_proposal',

        p_proposal_id::text,

        v_route_label,

        pg_catalog.jsonb_build_object(

            'actor_role',
            v_role,

            'route_id',
            v_proposal.route_id,

            'proposal_type',
            v_proposal.proposal_type,

            'before',
            v_current_snapshot,

            'after',

            pg_catalog.jsonb_build_object(

                'proposal_status',
                v_final_status,

                'moderation_note',
                v_final_note,

                'proposed_name',
                v_proposal.proposed_name,

                'proposed_sequence',
                v_proposed_sequence,

                'synchronization',
                v_sync_result,

                'applied_at',
                v_applied_at

            )

        )

    );


    -- ========================================================
    -- P. RETURN MODERATION RESULT
    -- ========================================================

    RETURN pg_catalog.jsonb_build_object(

        'proposal_id',
        p_proposal_id,

        'route_id',
        v_proposal.route_id,

        'proposal_type',
        v_proposal.proposal_type,

        'status',
        v_final_status,

        'moderation_note',
        v_final_note,

        'applied_at',
        v_applied_at,

        'synchronization',
        v_sync_result

    );


END;

$function$;

REVOKE ALL ON FUNCTION public.moderate_route_change_proposal(bigint, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_route_change_proposal(bigint, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_route_change_proposal_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rejection_note text;
  v_active_point_count integer;
  v_removed_point_count integer;
  v_route_stop_count integer;
  v_removed_link_count integer;
  v_updated_count integer;
  v_order_shift bigint;
BEGIN
  -- The moderator RPC first marks the proposal approved, approves the
  -- proposal-owned locations, and synchronizes the complete point sequence.
  -- Apply the route-specific removals/reordering only when applied_at is set
  -- after that synchronization. Rejections are still handled on the status update.
  IF NEW.status = 'approved'
     AND NEW.applied_at IS NOT NULL
     AND OLD.applied_at IS NULL
  THEN
    NULL;
  ELSIF OLD.status = 'pending'
        AND NEW.status IN ('rejected', 'conflicted', 'withdrawn')
        AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    v_rejection_note := COALESCE(
      NULLIF(pg_catalog.btrim(NEW.moderation_note), ''),
      CASE NEW.status
        WHEN 'conflicted' THEN 'The associated route-change proposal conflicted with the current route.'
        WHEN 'withdrawn' THEN 'The associated route-change proposal was withdrawn.'
        ELSE 'The associated route-change proposal was rejected.'
      END
    );

    UPDATE public.map_images AS image_row
    SET
      is_approved = false,
      moderation_status = 'rejected',
      moderation_note = v_rejection_note,
      moderated_by = NEW.moderated_by,
      moderated_at = COALESCE(NEW.moderated_at, pg_catalog.clock_timestamp())
    WHERE image_row.route_change_proposal_id = NEW.id
      AND image_row.is_deleted IS FALSE
      AND image_row.moderation_status = 'pending';

    RETURN NEW;
  ELSE
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    -- Fail closed when an active shared point's name or coordinates
    -- changed after the contributor captured its original-value snapshot.
    IF EXISTS (
      SELECT 1
      FROM public.route_change_proposal_points AS proposal_point
      LEFT JOIN public.terminals AS terminal_row
        ON terminal_row.id = proposal_point.terminal_id
      LEFT JOIN public.stops AS stop_row
        ON stop_row.id = proposal_point.stop_id
      WHERE proposal_point.proposal_id = NEW.id
        AND proposal_point.is_new_point IS FALSE
        AND proposal_point.is_removed_from_route IS FALSE
        AND (
          (
            proposal_point.proposed_name IS NOT NULL
            AND proposal_point.original_name IS NOT NULL
            AND (
              CASE
                WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.name
                ELSE stop_row.name
              END
            ) IS DISTINCT FROM proposal_point.original_name
          )
          OR (
            proposal_point.proposed_latitude IS NOT NULL
            AND (
              CASE
                WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.latitude
                ELSE stop_row.latitude
              END
            ) IS DISTINCT FROM proposal_point.original_latitude
          )
          OR (
            proposal_point.proposed_longitude IS NOT NULL
            AND (
              CASE
                WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.longitude
                ELSE stop_row.longitude
              END
            ) IS DISTINCT FROM proposal_point.original_longitude
          )
        )
    ) THEN
      RAISE EXCEPTION
        'One of the shared locations changed after this proposal was submitted. Review the route and submit a fresh proposal.'
        USING ERRCODE = '40001';
    END IF;

    -- Shared corrections apply only to locations that remain in the route.
    UPDATE public.stops AS stop_row
    SET
      name = COALESCE(proposal_point.proposed_name, stop_row.name),
      latitude = COALESCE(proposal_point.proposed_latitude, stop_row.latitude),
      longitude = COALESCE(proposal_point.proposed_longitude, stop_row.longitude)
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.stop_id = stop_row.id
      AND proposal_point.is_new_point IS FALSE
      AND proposal_point.is_removed_from_route IS FALSE
      AND (
        proposal_point.proposed_name IS NOT NULL
        OR proposal_point.proposed_latitude IS NOT NULL
      );

    UPDATE public.terminals AS terminal_row
    SET
      name = COALESCE(proposal_point.proposed_name, terminal_row.name),
      latitude = COALESCE(proposal_point.proposed_latitude, terminal_row.latitude),
      longitude = COALESCE(proposal_point.proposed_longitude, terminal_row.longitude)
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.terminal_id = terminal_row.id
      AND proposal_point.is_new_point IS FALSE
      AND proposal_point.is_removed_from_route IS FALSE
      AND (
        proposal_point.proposed_name IS NOT NULL
        OR proposal_point.proposed_latitude IS NOT NULL
      );

    -- Detach replaced points only from this route. Do not delete or
    -- mutate the shared terminal/stop record because other routes may use it.
    SELECT pg_catalog.count(*)::integer
    INTO v_removed_point_count
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.is_removed_from_route IS TRUE;

    DELETE FROM public.route_stops AS route_stop
    USING public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.is_removed_from_route IS TRUE
      AND route_stop.route_id = NEW.route_id
      AND route_stop.terminal_id IS NOT DISTINCT FROM proposal_point.terminal_id
      AND route_stop.stop_id IS NOT DISTINCT FROM proposal_point.stop_id;

    GET DIAGNOSTICS v_removed_link_count = ROW_COUNT;
    IF v_removed_link_count <> v_removed_point_count THEN
      RAISE EXCEPTION
        'The route no longer contains every location marked for removal. The proposal was not applied.'
        USING ERRCODE = '40001';
    END IF;

    -- A removed point with a conversion replacement remains a shared,
    -- reusable location and must not be globally deleted. For a true removal,
    -- soft-delete the shared record only after detaching it from this route
    -- and only when no other route still references it. This runs exclusively
    -- in the approved/applied branch of this trigger.
    UPDATE public.stops AS stop_row
    SET
      is_deleted = true,
      deleted_at = COALESCE(stop_row.deleted_at, pg_catalog.clock_timestamp()),
      deleted_by = NEW.moderated_by
    FROM public.route_change_proposal_points AS removed_point
    WHERE removed_point.proposal_id = NEW.id
      AND removed_point.is_removed_from_route IS TRUE
      AND removed_point.stop_id = stop_row.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.route_change_proposal_points AS replacement_point
        WHERE replacement_point.proposal_id = NEW.id
          AND replacement_point.is_new_point IS TRUE
          AND replacement_point.replaces_stop_order = removed_point.stop_order
      )
      AND stop_row.is_deleted IS FALSE
      AND NOT EXISTS (
        SELECT 1
        FROM public.route_stops AS remaining_route_stop
        WHERE remaining_route_stop.stop_id = stop_row.id
      );

    UPDATE public.terminals AS terminal_row
    SET
      is_deleted = true,
      deleted_at = COALESCE(terminal_row.deleted_at, pg_catalog.clock_timestamp()),
      deleted_by = NEW.moderated_by
    FROM public.route_change_proposal_points AS removed_point
    WHERE removed_point.proposal_id = NEW.id
      AND removed_point.is_removed_from_route IS TRUE
      AND removed_point.terminal_id = terminal_row.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.route_change_proposal_points AS replacement_point
        WHERE replacement_point.proposal_id = NEW.id
          AND replacement_point.is_new_point IS TRUE
          AND replacement_point.replaces_stop_order = removed_point.stop_order
      )
      AND terminal_row.is_deleted IS FALSE
      AND NOT EXISTS (
        SELECT 1
        FROM public.route_stops AS remaining_route_stop
        WHERE remaining_route_stop.terminal_id = terminal_row.id
      );

    SELECT pg_catalog.count(*)::integer
    INTO v_active_point_count
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.is_removed_from_route IS FALSE;

    SELECT pg_catalog.count(*)::integer
    INTO v_route_stop_count
    FROM public.route_stops AS route_stop
    WHERE route_stop.route_id = NEW.route_id;

    IF v_active_point_count < 2 OR v_route_stop_count <> v_active_point_count THEN
      RAISE EXCEPTION
        'The approved route locations do not match the complete active proposal sequence. The route was not reordered.'
        USING ERRCODE = '40001';
    END IF;

    -- Move all remaining rows outside the final range first so that a
    -- unique (route_id, stop_order) index cannot collide during reorder.
    SELECT COALESCE(pg_catalog.max(route_stop.stop_order), 0)::bigint
    INTO v_order_shift
    FROM public.route_stops AS route_stop
    WHERE route_stop.route_id = NEW.route_id;

    v_order_shift := v_order_shift + v_active_point_count + 1;

    UPDATE public.route_stops AS route_stop
    SET stop_order = route_stop.stop_order + v_order_shift
    WHERE route_stop.route_id = NEW.route_id;

    UPDATE public.route_stops AS route_stop
    SET stop_order = proposal_point.proposed_stop_order
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.is_removed_from_route IS FALSE
      AND proposal_point.proposed_stop_order > 0
      AND route_stop.route_id = NEW.route_id
      AND route_stop.terminal_id IS NOT DISTINCT FROM proposal_point.terminal_id
      AND route_stop.stop_id IS NOT DISTINCT FROM proposal_point.stop_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> v_active_point_count THEN
      RAISE EXCEPTION
        'Not every active proposed route location could be placed in the final sequence.'
        USING ERRCODE = '40001';
    END IF;

    -- A converted terminal is now represented in this route by the new
    -- stop's route_stops row. The original terminal remains reusable elsewhere.
    UPDATE public.map_images AS image_row
    SET
      is_approved = true,
      moderation_status = 'approved',
      moderation_note = NULL,
      moderated_by = NEW.moderated_by,
      moderated_at = COALESCE(NEW.moderated_at, pg_catalog.clock_timestamp())
    WHERE image_row.route_change_proposal_id = NEW.id
      AND image_row.is_deleted IS FALSE
      AND image_row.is_banned IS FALSE
      AND image_row.moderation_status = 'pending';

  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_route_change_proposal_edits
  ON public.route_change_proposals;

CREATE TRIGGER trg_apply_route_change_proposal_edits
AFTER UPDATE OF status, applied_at ON public.route_change_proposals
FOR EACH ROW
EXECUTE FUNCTION public.apply_route_change_proposal_edits();

COMMIT;
