-- =============================================================================
-- Migration: enforce max_guest_vehicles per unit on guest permit creation
-- Task: 868jd9c6a
--
-- Creates a BEFORE INSERT/UPDATE trigger on the permits table.
-- When a guest permit is inserted (or becomes active), the trigger:
--   1. Blocks the insert if max_guest_vehicles = 0 (guests not allowed for unit)
--   2. Counts existing active guest permits for that unit
--   3. Raises an exception if the count is already at max_guest_vehicles
--
-- Property admins (property_admin, org_admin, super_admin) bypass the check —
-- they can create guest permits above the limit or adjust max_guest_vehicles.
-- This mirrors the existing check_unit_vehicle_limit trigger for resident permits.
-- =============================================================================

-- ─── Trigger function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_unit_guest_vehicle_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_guest_vehicles  integer;
  v_active_guest_count  integer;
  v_unit_label          text;
  v_is_admin            boolean := false;
BEGIN
  -- Only enforce for active guest permits that have a unit assigned.
  IF NEW.type <> 'guest'
     OR NEW.unit_id IS NULL
     OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: if we're not changing the vehicle, unit, or status, skip.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.unit_id    = NEW.unit_id
       AND OLD.vehicle_id = NEW.vehicle_id
       AND OLD.status     = NEW.status THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Property admins bypass the limit check
  SELECT EXISTS (
    SELECT 1
    FROM property_members
    WHERE user_id    = auth.uid()
      AND property_id = NEW.property_id
      AND role IN ('property_admin', 'org_admin', 'super_admin')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Fetch unit label and guest limit
  SELECT unit_label, max_guest_vehicles
  INTO v_unit_label, v_max_guest_vehicles
  FROM units
  WHERE id = NEW.unit_id;

  -- Default to 0 (no guests) if somehow null — fail safe
  v_max_guest_vehicles := COALESCE(v_max_guest_vehicles, 0);

  -- Hard block: unit does not allow any guests
  IF v_max_guest_vehicles = 0 THEN
    RAISE EXCEPTION
      'Guest parking is not allowed for Unit %. Contact your property manager to enable guest permits.',
      v_unit_label;
  END IF;

  -- Count active guest permits for this unit, excluding the current row
  SELECT COUNT(*)
  INTO v_active_guest_count
  FROM permits
  WHERE unit_id  = NEW.unit_id
    AND status   = 'active'
    AND type     = 'guest'
    AND id      IS DISTINCT FROM NEW.id;

  IF v_active_guest_count >= v_max_guest_vehicles THEN
    RAISE EXCEPTION
      'Guest permit limit reached for Unit %. This unit allows % active guest permit(s) and already has %. Ask your property manager to increase the limit.',
      v_unit_label,
      v_max_guest_vehicles,
      v_active_guest_count;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Attach trigger ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS enforce_unit_guest_vehicle_limit ON permits;

CREATE TRIGGER enforce_unit_guest_vehicle_limit
  BEFORE INSERT OR UPDATE OF status, unit_id, vehicle_id
  ON permits
  FOR EACH ROW
  EXECUTE FUNCTION check_unit_guest_vehicle_limit();

-- ─── Verify ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'enforce_unit_guest_vehicle_limit'
  ) THEN
    RAISE EXCEPTION 'Trigger enforce_unit_guest_vehicle_limit was not created successfully';
  END IF;
  RAISE NOTICE 'enforce_unit_guest_vehicle_limit trigger installed successfully.';
END;
$$;
