-- ============================================================
-- Create crawl_queue table for pause/resume functionality
-- ============================================================

-- URL states: pending, in_progress, done, skipped, blocked
CREATE TABLE IF NOT EXISTS crawl_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id TEXT NOT NULL,
    site_id TEXT NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, done, skipped, blocked
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status_code INTEGER,
    error_message TEXT,
    
    CONSTRAINT unique_url_per_scan UNIQUE (scan_id, url)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_crawl_queue_scan_id ON crawl_queue(scan_id);
CREATE INDEX IF NOT EXISTS idx_crawl_queue_state ON crawl_queue(scan_id, state);
CREATE INDEX IF NOT EXISTS idx_crawl_queue_site_id ON crawl_queue(site_id);

-- Add scan state tracking to support pause/resume
-- Note: scan state is already tracked in ACTIVE_SCANS in-memory
-- This migration just ensures crawl_queue persistence
