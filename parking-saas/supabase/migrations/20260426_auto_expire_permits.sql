-- =============================================================================
-- Migration: auto-expire permits whose valid_to has passed
-- Task: 868jd9cku
--
-- Creates a pg_cron scheduled job that runs every 10 minutes and flips
-- any permit with status = 'active' and valid_to < now() to status = 'expired'.
--
-- This keeps guest permit counts accurate: both the DB trigger
-- (check_unit_guest_vehicle_limit) and the RPC (resident_create_guest_permit)
-- count active guest permits, so permits must be expired promptly.
--
-- NOTE: pg_cron jobs must be created in the 'postgres' database.
-- Run this migration in the Supabase SQL editor (which targets 'postgres').
-- =============================================================================

-- ─── Enable pg_cron extension ────────────────────────────────────────────────
-- pg_cron is available on all Supabase projects but must be enabled first.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── Expiry function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION expire_stale_permits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count integer;
BEGIN
  UPDATE permits
  SET    status     = 'expired',
         updated_at = now()
  WHERE  status    = 'active'
    AND  valid_to  < now();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  IF v_expired_count > 0 THEN
    RAISE NOTICE 'expire_stale_permits: % permit(s) expired at %', v_expired_count, now();
  END IF;
END;
$$;

-- Allow the cron worker (postgres role) to call this function
GRANT EXECUTE ON FUNCTION expire_stale_permits() TO postgres;

-- ─── Schedule the job ────────────────────────────────────────────────────────
-- Runs every 10 minutes. Unschedule first so re-running the migration is safe.

SELECT cron.unschedule('expire-stale-permits')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-permits'
);

SELECT cron.schedule(
  'expire-stale-permits',          -- job name
  '*/10 * * * *',                  -- every 10 minutes
  $cron$
    SELECT expire_stale_permits();
  $cron$
);

-- ─── Verify ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-permits'
  ) THEN
    RAISE EXCEPTION 'Cron job expire-stale-permits was not scheduled successfully';
  END IF;
  RAISE NOTICE 'expire-stale-permits cron job scheduled successfully (every 10 minutes).';
END;
$$;
