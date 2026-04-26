-- =============================================================================
-- Migration: resident self-service permit revocation and vehicle deletion
--
-- 1. resident_revoke_permit(p_permit_id)
--    Residents can revoke their own active permits.
--    Authorization: user must be a member of the permit's unit,
--                   OR the vehicle's owner_user_id matches the caller.
--
-- 2. resident_delete_vehicle(p_vehicle_id)
--    Residents can soft-delete their own vehicles (owner_user_id = auth.uid()).
--    Auto-revokes all active permits for that vehicle before deleting.
--
-- 3. auto_revoke_permits_on_vehicle_delete (trigger)
--    Safety net: whenever ANY vehicle's is_active is set to false
--    (regardless of who does it), all active permits for that vehicle
--    are automatically revoked.  Covers admin deletes too.
-- =============================================================================


-- ─── 1. resident_revoke_permit ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resident_revoke_permit(p_permit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permit permits%ROWTYPE;
BEGIN
  -- Fetch the permit
  SELECT * INTO v_permit FROM permits WHERE id = p_permit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permit not found';
  END IF;

  IF v_permit.status <> 'active' THEN
    RAISE EXCEPTION 'This permit is already % and cannot be revoked', v_permit.status;
  END IF;

  -- Authorization: caller must be a member of the permit's unit
  --               OR the registered owner of the permit's vehicle
  --               OR the original creator of the permit
  IF NOT (
    v_permit.created_by = auth.uid()
    OR (
      v_permit.unit_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unit_members
        WHERE unit_id = v_permit.unit_id AND user_id = auth.uid()
      )
    )
    OR (
      v_permit.vehicle_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM vehicles
        WHERE id = v_permit.vehicle_id AND owner_user_id = auth.uid()
      )
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to revoke this permit';
  END IF;

  UPDATE permits
  SET
    status     = 'revoked',
    revoked_at = now(),
    updated_at = now()
  WHERE id = p_permit_id;
END;
$$;

COMMENT ON FUNCTION resident_revoke_permit(uuid) IS
  'Allows a resident to revoke their own active parking permit. '
  'Authorization checks: unit membership, vehicle ownership, or permit creator.';


-- ─── 2. resident_delete_vehicle ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resident_delete_vehicle(p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vehicle vehicles%ROWTYPE;
BEGIN
  SELECT * INTO v_vehicle FROM vehicles WHERE id = p_vehicle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  -- Only the registered owner may delete
  IF v_vehicle.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You do not have permission to delete this vehicle';
  END IF;

  IF NOT v_vehicle.is_active THEN
    RAISE EXCEPTION 'Vehicle has already been removed';
  END IF;

  -- Revoke all active permits for this vehicle
  UPDATE permits
  SET
    status     = 'revoked',
    revoked_at = now(),
    updated_at = now()
  WHERE vehicle_id = p_vehicle_id
    AND status    = 'active';

  -- Soft-delete the vehicle
  UPDATE vehicles
  SET
    is_active  = false,
    updated_at = now()
  WHERE id = p_vehicle_id;
END;
$$;

COMMENT ON FUNCTION resident_delete_vehicle(uuid) IS
  'Allows a resident to delete (soft) their own vehicle. '
  'Auto-revokes any active permits tied to the vehicle.';


-- ─── 3. Trigger: auto-revoke permits when any vehicle is deactivated ─────────

CREATE OR REPLACE FUNCTION auto_revoke_permits_on_vehicle_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when is_active flips from true → false
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE permits
    SET
      status     = 'revoked',
      revoked_at = COALESCE(revoked_at, now()),
      updated_at = now()
    WHERE vehicle_id = NEW.id
      AND status    = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_revoke_permits_on_vehicle_delete ON vehicles;

CREATE TRIGGER trg_auto_revoke_permits_on_vehicle_delete
  AFTER UPDATE OF is_active
  ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION auto_revoke_permits_on_vehicle_delete();


-- ─── Verify ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'resident_revoke_permit'
  ) THEN
    RAISE EXCEPTION 'resident_revoke_permit function not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'resident_delete_vehicle'
  ) THEN
    RAISE EXCEPTION 'resident_delete_vehicle function not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_auto_revoke_permits_on_vehicle_delete'
  ) THEN
    RAISE EXCEPTION 'auto-revoke trigger not created';
  END IF;

  RAISE NOTICE 'resident vehicle/permit management migration installed successfully.';
END;
$$;
