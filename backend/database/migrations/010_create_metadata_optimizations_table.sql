-- Create metadata_optimizations table for "One-Click Fix" functionality
CREATE TABLE IF NOT EXISTS public.metadata_optimizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id VARCHAR(255) NOT NULL,
    page_url TEXT NOT NULL,
    
    -- Optimization details
    field VARCHAR(50) NOT NULL, -- 'title', 'description', 'h1'
    current_value TEXT,
    suggested_value TEXT NOT NULL,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'applied', 'failed'
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    applied_at TIMESTAMPTZ,
    
    CONSTRAINT fk_site_metadata FOREIGN KEY(site_id) REFERENCES public.sites(site_id) ON DELETE CASCADE
);

-- Index for plugin polling and dashboard view
CREATE INDEX IF NOT EXISTS idx_metadata_optimizations_site_id ON public.metadata_optimizations(site_id);
CREATE INDEX IF NOT EXISTS idx_metadata_optimizations_status ON public.metadata_optimizations(status);
