-- =============================================================================
-- Migration: Add patrol_officer to member_role enum
-- Task: 868jd9muk (step 1 of 2)
--
-- PostgreSQL requires a new enum value to be committed in its own transaction
-- before it can be referenced in policies or functions.
-- Run this migration FIRST, then run 20260501_enforcement_violations.sql.
-- =============================================================================

ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'patrol_officer';
