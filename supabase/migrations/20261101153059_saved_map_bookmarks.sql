-- Private bookmarks for each authenticated account. These tables are separate
-- from Contributions and do not change visibility on transit data tables.
CREATE TABLE public.saved_routes (
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  route_id bigint NOT NULL
    REFERENCES public.routes (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, route_id)
);

CREATE TABLE public.saved_stops (
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  stop_id bigint NOT NULL
    REFERENCES public.stops (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stop_id)
);

CREATE TABLE public.saved_terminals (
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users (id) ON DELETE CASCADE,
  terminal_id bigint NOT NULL
    REFERENCES public.terminals (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, terminal_id)
);

-- The primary keys index user_id for account-scoped reads. These indexes make
-- target-record hard-delete cascades efficient.
CREATE INDEX saved_routes_route_id_idx ON public.saved_routes (route_id);
CREATE INDEX saved_stops_stop_id_idx ON public.saved_stops (stop_id);
CREATE INDEX saved_terminals_terminal_id_idx ON public.saved_terminals (terminal_id);

ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_routes_select_own
  ON public.saved_routes FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY saved_routes_insert_own
  ON public.saved_routes FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY saved_routes_delete_own
  ON public.saved_routes FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY saved_stops_select_own
  ON public.saved_stops FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY saved_stops_insert_own
  ON public.saved_stops FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY saved_stops_delete_own
  ON public.saved_stops FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY saved_terminals_select_own
  ON public.saved_terminals FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY saved_terminals_insert_own
  ON public.saved_terminals FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY saved_terminals_delete_own
  ON public.saved_terminals FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Remove any default grants on these new tables, then grant only the operations
-- required by the feature. No public/anonymous or service-role API access.
REVOKE ALL PRIVILEGES ON TABLE
  public.saved_routes,
  public.saved_stops,
  public.saved_terminals
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, DELETE ON TABLE
  public.saved_routes,
  public.saved_stops,
  public.saved_terminals
TO authenticated;

COMMENT ON TABLE public.saved_routes IS
  'Private route bookmarks. RLS limits each account to its own rows.';
COMMENT ON TABLE public.saved_stops IS
  'Private stop bookmarks. RLS limits each account to its own rows.';
COMMENT ON TABLE public.saved_terminals IS
  'Private terminal bookmarks. RLS limits each account to its own rows.';
