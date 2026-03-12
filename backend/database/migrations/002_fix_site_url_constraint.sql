-- ============================================================
-- Fix: Allow Multiple Users to Add Same Site URL
-- ============================================================
-- Problem: Current unique constraint on site_url prevents 
-- different users from monitoring the same website.
--
-- Solution: Change from site_url unique constraint to 
-- composite unique constraint on (user_id, site_url)
-- ============================================================

-- Step 1: Drop the incorrect unique constraint on site_url
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_site_url_key;

-- Step 2: Add correct composite unique constraint
-- This allows the same site_url for different users, but prevents
-- the same user from adding the same site twice
ALTER TABLE sites 
ADD CONSTRAINT sites_user_site_unique 
UNIQUE (user_id, site_url);

-- ============================================================
-- Verification Query
-- ============================================================
-- Run this to confirm the new constraint is in place:
-- 
-- SELECT constraint_name, constraint_type 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'sites' AND constraint_type = 'UNIQUE';
-- ============================================================
