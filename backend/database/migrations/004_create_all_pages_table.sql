-- ============================================================
-- Create all_pages table for dashboard stats
-- ============================================================

CREATE TABLE IF NOT EXISTS all_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id TEXT NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    last_crawled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'ok', -- 'ok', 'broken', 'redirected'
    
    CONSTRAINT unique_page_per_site UNIQUE (site_id, url)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_all_pages_site_id ON all_pages(site_id);
