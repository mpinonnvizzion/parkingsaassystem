-- =============================================================================
-- Migration: log_violation RPC
-- Task: 868jd9mv8
--
-- A SECURITY DEFINER function that patrol officers and admins call to log a
-- parking violation. It auto-resolves vehicle_id and unit_id from the plate so
-- the caller only needs to provide the plate, location, notes, and photo_url.
--
-- The photo is uploaded to Supabase Storage client-side before calling this
-- function; the resulting public URL is passed as p_photo_url.
-- =============================================================================

CREATE OR REPLACE FUNCTION log_violation(
  p_property_id  uuid,
  p_plate        text,
  p_location     text     DEFAULT NULL,
  p_notes        text     DEFAULT NULL,
  p_photo_url    text     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plate           text := upper(trim(p_plate));
  v_vehicle_id      uuid;
  v_unit_id         uuid;
  v_is_active       boolean;
  v_owner_user_id   uuid;
  v_violation_id    uuid;
BEGIN
  -- Caller must be a property member with enforcement access
  IF NOT EXISTS (
    SELECT 1 FROM property_members
    WHERE property_id = p_property_id
      AND user_id     = auth.uid()
      AND role IN ('super_admin', 'org_admin', 'property_admin', 'staff', 'patrol_officer')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_plate = '' THEN
    RAISE EXCEPTION 'Plate is required';
  END IF;

  -- Auto-resolve vehicle from plate.
  -- Prefer active (resident) vehicles over inactive (guest) ones.
  SELECT id, is_active, owner_user_id
  INTO   v_vehicle_id, v_is_active, v_owner_user_id
  FROM   vehicles
  WHERE  plate       = v_plate
    AND  property_id = p_property_id
  ORDER BY is_active DESC
  LIMIT 1;

  -- Auto-resolve unit from vehicle
  IF v_vehicle_id IS NOT NULL THEN
    IF v_is_active AND v_owner_user_id IS NOT NULL THEN
      -- Resident vehicle: resolve unit via unit_members
      SELECT u.id INTO v_unit_id
      FROM   units u
      JOIN   unit_members um ON um.unit_id = u.id
      WHERE  um.user_id    = v_owner_user_id
        AND  u.property_id = p_property_id
      LIMIT 1;
    ELSE
      -- Guest vehicle: resolve unit via most recent active permit
      SELECT p.unit_id INTO v_unit_id
      FROM   permits p
      WHERE  p.vehicle_id  = v_vehicle_id
        AND  p.property_id = p_property_id
        AND  p.status      = 'active'
      ORDER BY p.created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- Insert the violation
  INSERT INTO violations (
    property_id,
    unit_id,
    vehicle_id,
    plate,
    location,
    notes,
    photo_url,
    logged_by,
    status
  ) VALUES (
    p_property_id,
    v_unit_id,
    v_vehicle_id,
    v_plate,
    nullif(trim(coalesce(p_location, '')), ''),
    nullif(trim(coalesce(p_notes,    '')), ''),
    p_photo_url,
    auth.uid(),
    'open'
  )
  RETURNING id INTO v_violation_id;

  RETURN v_violation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_violation(uuid, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── Verify ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE proname = 'log_violation' AND nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'log_violation function was not created';
  END IF;
  RAISE NOTICE 'log_violation RPC installed successfully.';
END;
$$;
