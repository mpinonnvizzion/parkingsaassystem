-- =============================================================================
-- Migration: enforce max_vehicles per unit on permit creation
-- Task: 868jd80b5
--
-- Creates a BEFORE INSERT/UPDATE trigger on the permits table.
-- When a resident creates a new active permit for a unit, the trigger:
--   1. Counts existing active resident permits for that unit
--   2. Raises an exception if the count is already at max_vehicles
--
-- Property admins (property_admin, org_admin, super_admin) bypass the check —
-- they can create permits above the limit or adjust max_vehicles on the unit.
-- =============================================================================

-- ─── Trigger function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_unit_vehicle_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_vehicles  integer;
  v_active_count  integer;
  v_unit_label    text;
  v_is_admin      boolean := false;
BEGIN
  -- Only enforce for active resident permits that have a unit assigned.
  -- Skip when revoking / expiring (status changing away from active)
  -- and skip visitor permits entirely.
  IF NEW.type <> 'resident'
     OR NEW.unit_id IS NULL
     OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: if we're not changing the vehicle or unit, skip (e.g. revoke).
  IF TG_OP = 'UPDATE' THEN
    IF OLD.unit_id = NEW.unit_id AND OLD.vehicle_id = NEW.vehicle_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Property admins bypass the limit check
  -- (they can also raise max_vehicles via the units table)
  SELECT EXISTS (
    SELECT 1
    FROM property_members
    WHERE user_id = auth.uid()
      AND property_id = NEW.property_id
      AND role IN ('property_admin', 'org_admin', 'super_admin')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Fetch unit label and limit
  SELECT unit_label, max_vehicles
  INTO v_unit_label, v_max_vehicles
  FROM units
  WHERE id = NEW.unit_id;

  -- max_vehicles defaults to 2 if somehow null
  v_max_vehicles := COALESCE(v_max_vehicles, 2);

  -- Count active resident permits for this unit, excluding the current row
  SELECT COUNT(*)
  INTO v_active_count
  FROM permits
  WHERE unit_id  = NEW.unit_id
    AND status   = 'active'
    AND type     = 'resident'
    AND id      IS DISTINCT FROM NEW.id;

  IF v_active_count >= v_max_vehicles THEN
    RAISE EXCEPTION
      'Permit limit reached for Unit %. This unit allows % vehicle(s) and already has % active permit(s). Ask your property manager to increase the limit.',
      v_unit_label,
      v_max_vehicles,
      v_active_count;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Attach trigger ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS enforce_unit_vehicle_limit ON permits;

CREATE TRIGGER enforce_unit_vehicle_limit
  BEFORE INSERT OR UPDATE OF status, unit_id, vehicle_id
  ON permits
  FOR EACH ROW
  EXECUTE FUNCTION check_unit_vehicle_limit();

-- ─── Verify (runs silently, just checks the trigger exists) ──────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'enforce_unit_vehicle_limit'
  ) THEN
    RAISE EXCEPTION 'Trigger enforce_unit_vehicle_limit was not created successfully';
  END IF;
  RAISE NOTICE 'enforce_unit_vehicle_limit trigger installed successfully.';
END;
$$;
