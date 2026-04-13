-- Cadence — aggressive wipe: drop every user table in schema `public` on the linked project.
-- Skips common PostGIS catalog tables if present. Does NOT touch auth, storage, or other schemas.
-- Used by: pnpm db:cloud --clear-force  or  pnpm db:cloud:clear-force
--
-- After this, run `pnpm db:cloud` or `pnpm db:cloud:reset` to recreate Cadence tables + seed.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        'spatial_ref_sys',
        'geometry_columns',
        'geography_columns',
        'raster_columns',
        'raster_overviews'
      )
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
END $$;
