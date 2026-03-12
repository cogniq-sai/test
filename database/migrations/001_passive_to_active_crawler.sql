-- ============================================================
-- SEOFlow AI - Database Migration: Passive to Active Crawler
-- Run this in Supabase SQL Editor
-- ============================================================

-- STEP 1: DROP old error_logs table (passive 404 listener)
-- WARNING: This will delete all existing 404 log data
DROP TABLE IF EXISTS error_logs CASCADE;


-- STEP 2: CREATE new scan_errors table (active crawler results)
CREATE TABLE scan_errors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
    
    -- Error classification
    type TEXT NOT NULL CHECK (type IN ('internal', 'external', 'plain')),
    -- 'internal' = link to another page on same domain that's broken
    -- 'external' = link to external site that's broken  
    -- 'plain' = plain text URL (not a hyperlink) that's broken
    
    -- Link details
    source_url TEXT NOT NULL,      -- Page where the broken link was found
    broken_url TEXT NOT NULL,      -- The URL that is broken
    anchor_text TEXT,              -- Link text (for <a> tags)
    status_code INTEGER NOT NULL,  -- HTTP status code (404, 500, etc)
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for fast queries
    CONSTRAINT unique_error UNIQUE (site_id, source_url, broken_url)
);

-- Index for fast site lookups
CREATE INDEX idx_scan_errors_site_id ON scan_errors(site_id);

-- Index for filtering by type
CREATE INDEX idx_scan_errors_type ON scan_errors(type);

-- Index for recent errors first
CREATE INDEX idx_scan_errors_created ON scan_errors(created_at DESC);


-- STEP 3: Add scan tracking columns to sites table
ALTER TABLE sites 
ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'never',
ADD COLUMN IF NOT EXISTS total_errors INTEGER DEFAULT 0;

-- scan_status values: 'never', 'running', 'completed', 'failed'


-- ============================================================
-- VERIFICATION: Check tables were created correctly
-- ============================================================
-- Run this to verify:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'scan_errors';
