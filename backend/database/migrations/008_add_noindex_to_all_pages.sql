-- ============================================================
-- Add is_noindex column to all_pages table
-- ============================================================

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='all_pages' AND column_name='is_noindex'
    ) THEN
        ALTER TABLE all_pages ADD COLUMN is_noindex BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
