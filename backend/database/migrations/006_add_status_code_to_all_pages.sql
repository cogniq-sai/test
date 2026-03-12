-- ============================================================
-- Add status_code column to all_pages table
-- ============================================================

-- Add status_code column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='all_pages' AND column_name='status_code'
    ) THEN
        ALTER TABLE all_pages ADD COLUMN status_code INTEGER;
    END IF;
END $$;

-- Update existing rows to have status_code based on status
UPDATE all_pages 
SET status_code = CASE 
    WHEN status = 'ok' THEN 200
    WHEN status = 'broken' THEN 404
    WHEN status = 'redirected' THEN 301
    WHEN status = 'error' THEN 500
    WHEN status = 'timeout' THEN 0
    ELSE 0
END
WHERE status_code IS NULL;
