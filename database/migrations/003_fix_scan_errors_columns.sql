-- ============================================================
-- Fix: scan_errors table alignment
-- ============================================================
-- 1. Add scan_id column to track which scan found the error
-- 2. Rename 'type' to 'error_type' to match code better (optional but safer)
-- 3. Update constraints
-- ============================================================

-- Add scan_id if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scan_errors' AND column_name='scan_id') THEN
        ALTER TABLE scan_errors ADD COLUMN scan_id TEXT;
    END IF;
END $$;

-- Check if 'type' exists and rename to 'error_type' if needed
-- Actually, migration 001 used 'type'. Let's keep it 'type' in DB 
-- but we must ensure scan.py uses 'type' prefixing.
-- Wait, let's just make it 'error_type' to avoid SQL keyword confusion
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scan_errors' AND column_name='type') THEN
        ALTER TABLE scan_errors RENAME COLUMN "type" TO "error_type";
    END IF;
END $$;

-- Update the unique constraint to include scan_id
-- This allows us to re-discover the same error in a new scan
ALTER TABLE scan_errors DROP CONSTRAINT IF EXISTS unique_error;
ALTER TABLE scan_errors ADD CONSTRAINT unique_error_per_scan UNIQUE (site_id, scan_id, source_url, broken_url);
