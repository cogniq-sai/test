-- Migration: Add Notifications Table
-- Description: Adds a table to store in-app notifications for users, such as when an SEO plugin is detected.

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id TEXT REFERENCES public.sites(site_id) ON DELETE CASCADE,
    type TEXT NOT NULL,          -- e.g., 'plugin_detected', 'scan_error', 'sitemap_generated'
    message TEXT NOT NULL,       -- e.g., 'RankMath SEO plugin detected. Sitemap auto-generation paused.'
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for faster queries when fetching unread notifications or ordering by latest
CREATE INDEX idx_notifications_site_id ON public.notifications(site_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);

-- Example RLS Policy (adjust to match the rest of your app's security model if needed)
-- ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view their own notifications" ON public.notifications
--     FOR SELECT USING (auth.uid() IN (SELECT user_id FROM user_sites WHERE site_id = notifications.site_id));
