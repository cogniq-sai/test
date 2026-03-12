-- ============================================================
-- Fix: Update error_type constraint to match new crawler
-- ============================================================
-- The new custom crawler uses: 'internal', 'external'
-- Old constraint had: 'internal', 'external', 'plain'
-- Migration 003 renamed 'type' to 'error_type' but constraint wasn't updated
-- ============================================================

-- Drop old constraint if exists (both old and new names)
ALTER TABLE scan_errors DROP CONSTRAINT IF EXISTS scan_errors_type_check;
ALTER TABLE scan_errors DROP CONSTRAINT IF EXISTS scan_errors_error_type_check;

-- Add new constraint with correct column name and values
ALTER TABLE scan_errors 
ADD CONSTRAINT scan_errors_error_type_check 
CHECK (error_type IN ('internal', 'external'));

-- Note: We only report 404 and 410 as broken
-- Status 0, 403, 429, timeouts are NOT saved as errors
