-- =============================================================================
-- Migration: Enforcement & Violations (step 2 of 2)
-- Task: 868jd9muk
--
-- Requires 20260501_add_patrol_officer_role.sql to be run first so that
-- the patrol_officer enum value is committed before it is referenced here.
--
-- 1. Creates violation_status enum
-- 2. Creates violations table with indexes, RLS, and updated_at trigger
-- 3. Creates lookup_plate_for_enforcement() SECURITY DEFINER RPC
-- 4. Creates violation-photos Storage bucket with access policies
-- =============================================================================

-- ─── 1. violation_status enum ─────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'violation_status') THEN
    CREATE TYPE violation_status AS ENUM (
      'open',
      'warning_issued',
      'tow_requested',
      'towed',
      'dismissed'
    );
  END IF;
END;
$$;

-- ─── 3. violations table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS violations (
  id                 uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid             NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id            uuid             REFERENCES units(id) ON DELETE SET NULL,
  vehicle_id         uuid             REFERENCES vehicles(id) ON DELETE SET NULL,
  plate              text             NOT NULL,
  location           text,
  notes              text,
  status             violation_status NOT NULL DEFAULT 'open',
  photo_url          text,
  logged_by          uuid             REFERENCES auth.users(id),
  tow_requested_at   timestamptz,
  tow_requested_by   uuid             REFERENCES auth.users(id),
  towed_at           timestamptz,
  resolved_at        timestamptz,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS violations_property_id_idx   ON violations(property_id);
CREATE INDEX IF NOT EXISTS violations_plate_idx         ON violations(property_id, plate);
CREATE INDEX IF NOT EXISTS violations_status_idx        ON violations(property_id, status);
CREATE INDEX IF NOT EXISTS violations_created_at_idx    ON violations(property_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_violations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS violations_updated_at ON violations;
CREATE TRIGGER violations_updated_at
  BEFORE UPDATE ON violations
  FOR EACH ROW EXECUTE FUNCTION update_violations_updated_at();

-- Enable RLS
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;

-- Enforcement roles can read violations for their property
CREATE POLICY "violations_select_enforcement" ON violations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM property_members
      WHERE property_id = violations.property_id
        AND user_id     = auth.uid()
        AND role IN ('super_admin', 'org_admin', 'property_admin', 'staff', 'patrol_officer')
    )
  );

-- Enforcement roles can insert violations (must set themselves as logged_by)
CREATE POLICY "violations_insert_enforcement" ON violations
  FOR INSERT
  WITH CHECK (
    logged_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM property_members
      WHERE property_id = violations.property_id
        AND user_id     = auth.uid()
        AND role IN ('super_admin', 'org_admin', 'property_admin', 'staff', 'patrol_officer')
    )
  );

-- Only admins and staff can update violation status (not patrol_officer)
CREATE POLICY "violations_update_admin" ON violations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM property_members
      WHERE property_id = violations.property_id
        AND user_id     = auth.uid()
        AND role IN ('super_admin', 'org_admin', 'property_admin', 'staff')
    )
  );

-- ─── 4. lookup_plate_for_enforcement RPC ──────────────────────────────────────
-- Returns a JSON object with vehicle registration, unit, active permit, and
-- violation history count for a given plate at a property.

CREATE OR REPLACE FUNCTION lookup_plate_for_enforcement(
  p_property_id  uuid,
  p_plate        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plate             text := upper(trim(p_plate));
  v_vehicle_id        uuid;
  v_is_active         boolean;
  v_make              text;
  v_model             text;
  v_color             text;
  v_year              integer;
  v_owner_user_id     uuid;
  v_unit_id           uuid;
  v_unit_label        text;
  v_permit_id         uuid;
  v_permit_type       text;
  v_permit_status     text;
  v_permit_valid_to   timestamptz;
  v_violation_count   integer;
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

  -- Look up vehicle by plate at this property.
  -- Prefer active (resident) vehicles over inactive (guest) ones.
  SELECT id, is_active, make, model, color, year, owner_user_id
  INTO   v_vehicle_id, v_is_active, v_make, v_model, v_color, v_year, v_owner_user_id
  FROM   vehicles
  WHERE  plate       = v_plate
    AND  property_id = p_property_id
  ORDER BY is_active DESC
  LIMIT 1;

  -- Determine unit
  IF v_vehicle_id IS NOT NULL THEN
    IF v_is_active AND v_owner_user_id IS NOT NULL THEN
      -- Resident vehicle: resolve unit via unit_members
      SELECT u.id, u.unit_label
      INTO   v_unit_id, v_unit_label
      FROM   units u
      JOIN   unit_members um ON um.unit_id = u.id
      WHERE  um.user_id    = v_owner_user_id
        AND  u.property_id = p_property_id
      LIMIT 1;
    ELSE
      -- Guest vehicle: resolve unit via the most recent active permit
      SELECT u.id, u.unit_label
      INTO   v_unit_id, v_unit_label
      FROM   units u
      JOIN   permits p ON p.unit_id = u.id
      WHERE  p.vehicle_id   = v_vehicle_id
        AND  p.property_id  = p_property_id
        AND  p.status       = 'active'
      ORDER BY p.created_at DESC
      LIMIT 1;
    END IF;

    -- Get most recent active permit for this vehicle
    SELECT p.id, p.type::text, p.status::text, p.valid_to
    INTO   v_permit_id, v_permit_type, v_permit_status, v_permit_valid_to
    FROM   permits p
    WHERE  p.vehicle_id  = v_vehicle_id
      AND  p.property_id = p_property_id
      AND  p.status      = 'active'
      AND  (p.valid_to IS NULL OR p.valid_to > now())
    ORDER BY p.created_at DESC
    LIMIT 1;
  END IF;

  -- Count all violations for this plate at this property
  SELECT COUNT(*)
  INTO   v_violation_count
  FROM   violations
  WHERE  plate       = v_plate
    AND  property_id = p_property_id;

  RETURN jsonb_build_object(
    'plate',           v_plate,
    'registered',      v_vehicle_id IS NOT NULL AND v_is_active = true,
    'is_guest',        v_vehicle_id IS NOT NULL AND v_is_active = false,
    'vehicle',         CASE WHEN v_vehicle_id IS NOT NULL THEN
                         jsonb_build_object(
                           'id',    v_vehicle_id,
                           'make',  v_make,
                           'model', v_model,
                           'color', v_color,
                           'year',  v_year
                         )
                       ELSE NULL END,
    'unit',            CASE WHEN v_unit_id IS NOT NULL THEN
                         jsonb_build_object(
                           'id',         v_unit_id,
                           'unit_label', v_unit_label
                         )
                       ELSE NULL END,
    'permit',          CASE WHEN v_permit_id IS NOT NULL THEN
                         jsonb_build_object(
                           'id',       v_permit_id,
                           'type',     v_permit_type,
                           'status',   v_permit_status,
                           'valid_to', v_permit_valid_to
                         )
                       ELSE NULL END,
    'violation_count', v_violation_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_plate_for_enforcement(uuid, text) TO authenticated;

-- ─── 5. violation-photos Storage bucket ───────────────────────────────────────
-- Creates a public bucket for violation photo evidence.
-- Photos are uploaded with property-scoped paths so they cannot be guessed.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'violation-photos',
  'violation-photos',
  true,
  10485760,  -- 10 MB limit per photo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Only enforcement roles can upload
DROP POLICY IF EXISTS "violation_photos_insert" ON storage.objects;
CREATE POLICY "violation_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'violation-photos'
    AND EXISTS (
      SELECT 1 FROM public.property_members
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'org_admin', 'property_admin', 'staff', 'patrol_officer')
    )
  );

-- Enforcement roles can read photos
DROP POLICY IF EXISTS "violation_photos_select" ON storage.objects;
CREATE POLICY "violation_photos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'violation-photos'
    AND EXISTS (
      SELECT 1 FROM public.property_members
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'org_admin', 'property_admin', 'staff', 'patrol_officer')
    )
  );

-- ─── Reload PostgREST schema cache ────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ─── Verify ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'violations') THEN
    RAISE EXCEPTION 'violations table was not created';
  END IF;
  RAISE NOTICE 'Enforcement & Violations migration applied successfully.';
END;
$$;
