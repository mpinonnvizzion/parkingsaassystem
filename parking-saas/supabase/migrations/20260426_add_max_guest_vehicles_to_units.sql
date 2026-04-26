-- Add max_guest_vehicles to units table
-- Controls how many simultaneous active guest permits a unit can have.
-- Defaults to 1 so existing units are not disrupted.

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS max_guest_vehicles integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN units.max_guest_vehicles IS
  'Maximum number of simultaneously active guest permits allowed for this unit. Enforced by the check_unit_guest_vehicle_limit trigger (added in a later migration).';
