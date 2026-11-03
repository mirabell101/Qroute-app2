-- Supabase default function privileges granted service_role EXECUTE as well.
-- Remove only that explicit grant; anon remains the sole API caller.
REVOKE EXECUTE ON FUNCTION public.get_public_map_data() FROM service_role;
