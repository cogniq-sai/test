-- Update Error Type Classification
-- Migrates error types to new classification system

-- Step 1: Drop ALL old constraints (both possible names)
ALTER TABLE scan_errors DROP CONSTRAINT IF EXISTS scan_errors_type_check;
ALTER TABLE scan_errors DROP CONSTRAINT IF EXISTS scan_errors_error_type_check;

-- Step 2: Migrate ALL existing data to new format
UPDATE scan_errors 
SET error_type = CASE 
    -- Old format to new format
    WHEN error_type = 'internal' THEN 'internal_404'
    WHEN error_type = 'external' THEN 'external_404'
    WHEN error_type = 'dead_domain' THEN 'external_404'
    WHEN error_type = 'standard' THEN 'standard_404'
    WHEN error_type = 'plain' THEN 'internal_404'
    
    -- Already in new format (keep as is)
    WHEN error_type = 'internal_404' THEN 'internal_404'
    WHEN error_type = 'external_404' THEN 'external_404'
    WHEN error_type = 'standard_404' THEN 'standard_404'
    
    -- Any other type defaults to internal_404
    ELSE 'internal_404'
END;

-- Step 3: Add new constraint with updated error types
ALTER TABLE scan_errors 
ADD CONSTRAINT scan_errors_error_type_check 
CHECK (error_type IN (
    'internal_404',
    'external_404',
    'standard_404',
    'internal_500',
    'internal_403',
    'internal_401'
));

-- Step 4: Add performance indexes
CREATE INDEX IF NOT EXISTS idx_scan_errors_error_type ON scan_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_scan_errors_priority ON scan_errors(site_id, error_type, created_at DESC);
