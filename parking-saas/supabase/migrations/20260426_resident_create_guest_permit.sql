-- resident_create_guest_permit
-- Called by authenticated residents to create a time-limited guest permit for a visitor.
-- Enforces unit-level max_guest_vehicles limit and creates a disposable vehicle record
-- (is_active = false) so it does not appear in the resident's vehicles list.

CREATE OR REPLACE FUNCTION resident_create_guest_permit(
  p_property_id    uuid,
  p_unit_id        uuid,
  p_plate          text,
  p_guest_name     text    DEFAULT NULL,
  p_duration_hours integer DEFAULT 24
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit               units%ROWTYPE;
  v_active_guest_count integer;
  v_vehicle_id         uuid;
  v_permit_id          uuid;
BEGIN
  -- Caller must be a member of this unit
  IF NOT EXISTS (
    SELECT 1 FROM unit_members
    WHERE unit_id = p_unit_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not a member of this unit';
  END IF;

  -- Load unit, confirming it belongs to this property
  SELECT * INTO v_unit
  FROM units
  WHERE id = p_unit_id AND property_id = p_property_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  -- Unit-level block: max_guest_vehicles = 0 means no guests allowed for this unit
  IF v_unit.max_guest_vehicles = 0 THEN
    RAISE EXCEPTION 'Guest parking is not allowed for unit %', v_unit.unit_label;
  END IF;

  -- Count currently active guest permits for this unit
  SELECT COUNT(*) INTO v_active_guest_count
  FROM permits
  WHERE unit_id        = p_unit_id
    AND property_id    = p_property_id
    AND type           = 'guest'
    AND status         = 'active';

  IF v_active_guest_count >= v_unit.max_guest_vehicles THEN
    RAISE EXCEPTION
      'Guest limit reached for unit %. It allows % active guest permit(s) and already has %.',
      v_unit.unit_label, v_unit.max_guest_vehicles, v_active_guest_count;
  END IF;

  -- Validate duration
  IF p_duration_hours NOT IN (24, 48, 72) THEN
    RAISE EXCEPTION 'Duration must be 24, 48, or 72 hours';
  END IF;

  -- Find an existing vehicle record for this plate at this property, or create one.
  -- Guest vehicles are stored with is_active = false so they are invisible in the
  -- vehicles management list but can still be referenced by permits.
  SELECT id INTO v_vehicle_id
  FROM vehicles
  WHERE plate       = upper(trim(p_plate))
    AND property_id = p_property_id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO vehicles (plate, property_id, owner_user_id, is_active)
    VALUES (upper(trim(p_plate)), p_property_id, auth.uid(), false)
    RETURNING id INTO v_vehicle_id;
  END IF;

  -- Create the guest permit
  INSERT INTO permits (
    property_id,
    unit_id,
    vehicle_id,
    type,
    status,
    valid_from,
    valid_to,
    visitor_name,
    created_by,
    qr_token
  ) VALUES (
    p_property_id,
    p_unit_id,
    v_vehicle_id,
    'guest',
    'active',
    now(),
    now() + (p_duration_hours || ' hours')::interval,
    nullif(trim(coalesce(p_guest_name, '')), ''),
    auth.uid(),
    gen_random_uuid()::text
  )
  RETURNING id INTO v_permit_id;

  RETURN v_permit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION resident_create_guest_permit(uuid, uuid, text, text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
