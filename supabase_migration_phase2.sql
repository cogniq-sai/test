-- Run this in your Supabase SQL Editor to support the new Human-in-the-Loop Sitemap flow and Plugin Detection

-- 1. Add active_seo_plugins column to sites table if it doesn't exist
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS active_seo_plugins JSONB DEFAULT '[]'::jsonb;

-- 2. Create the sitemap_suggestions table
CREATE TABLE IF NOT EXISTS public.sitemap_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id VARCHAR(255) NOT NULL,
    
    -- Status Tracking (The Human-in-the-loop mechanism)
    -- Options: 'pending' (waiting for user review), 'approved' (user clicked approve), 'rejected' (user ignored/deleted)
    approval_status VARCHAR(20) DEFAULT 'pending', 
    
    -- The Content
    -- We store the full suggested XML string here, exactly as the AI/backend generated it.
    suggested_xml_content TEXT NOT NULL, 
    
    -- Metrics
    total_urls INT NOT NULL,
    
    -- System Tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT fk_site FOREIGN KEY(site_id) REFERENCES public.sites(site_id) ON DELETE CASCADE
);

-- Index for fast user dashboard loading
CREATE INDEX IF NOT EXISTS idx_sitemap_suggestions_site_id ON public.sitemap_suggestions(site_id);
