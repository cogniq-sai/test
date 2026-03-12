"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { getSites, getScanErrors, getAllActiveScans, getAllPages, Site, getSiteHealth, getUserNotifications } from "../lib/api";
import { Activity } from "../components/dashboard/ActivityFeed";

interface AggregatedStats {
    totalSites: number;
    total404s: number;
    totalPages: number;
    scanCoverage: number;
}

interface DashboardContextType {
    sites: Site[];
    stats: AggregatedStats;
    activities: Activity[];
    isLoading: boolean;
    refreshData: () => Promise<void>;
    addActivity: (activity: Activity) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function useDashboard() {
    const context = useContext(DashboardContext);
    if (!context) {
        throw new Error("useDashboard must be used within a DashboardProvider");
    }
    return context;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
    const { user, token, isAuthenticated } = useAuth();

    const [sites, setSites] = useState<Site[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState<AggregatedStats>({
        totalSites: 0,
        total404s: 0,
        totalPages: 0,
        scanCoverage: 0
    });
    const [activities, setActivities] = useState<Activity[]>([]);
    const [lastFetched, setLastFetched] = useState<number>(0);

    const refreshData = async () => {
        if (!isAuthenticated || !user?.id || !token) {
            setIsLoading(false);
            return;
        }

        try {
            // Parallel fetch of lightweight endpoints
            const [sitesResponse, activeScansResponse] = await Promise.all([
                getSites(user.id),
                getAllActiveScans(token).catch(() => ({ active_scans: [], count: 0 }))
            ]);

            const activeScansMap = new Map((activeScansResponse.active_scans || []).map(scan => [scan.site_id, scan]));

            // Process sites - Fetch pages and errors for complete data
            const enrichedSitesPromises = sitesResponse.sites.map(async (site) => {
                try {
                    // Fetch both pages and errors in parallel for complete picture
                    // This is a WORKAROUND because the backend site listing has field name mismatches
                    const [pagesResponse, errorsResponse, healthResponse] = await Promise.all([
                        getAllPages(site.id).catch((err) => {
                            console.warn(`Failed to fetch pages for site ${site.id}:`, err.message);
                            return { success: false, site_id: site.id, total_pages: 0, pages: [] };
                        }),
                        getScanErrors(token, site.id).catch((err) => {
                            console.warn(`Failed to fetch errors for site ${site.id}:`, err.message);
                            return { success: false, errors: [] };
                        }),
                        getSiteHealth(token, site.id).catch((err) => {
                            console.warn(`Failed to fetch health for site ${site.id}:`, err.message);
                            return { score: 0, status: 'No data' };
                        })
                    ]);

                    // Get accurate page count from actual pages fetched
                    const hasPages = pagesResponse.success && pagesResponse.pages && Array.isArray(pagesResponse.pages) && pagesResponse.pages.length > 0;
                    const totalPages = hasPages ? pagesResponse.pages.length :
                        (pagesResponse.success && pagesResponse.total_pages > 0 ? pagesResponse.total_pages : 0);

                    // Get error count - Prefer the direct API response over the potentially broken site.totalErrors
                    const hasErrors = errorsResponse.success && errorsResponse.errors && Array.isArray(errorsResponse.errors) && errorsResponse.errors.length > 0;
                    const totalErrors = hasErrors ? errorsResponse.errors.length : (site.totalErrors || 0);

                    // Log for debugging
                    if (totalPages > 0 || totalErrors > 0) {
                        console.log(`Site ${site.url}: ${totalPages} pages, ${totalErrors} errors`);
                    }

                    // Get last activity from the most recent page crawl
                    let lastActivity: string | undefined;
                    if (hasPages && pagesResponse.pages.length > 0) {
                        const latestPage = pagesResponse.pages.reduce((latest, page: any) => {
                            const pageDate = page.crawledAt || page.crawled_at || page.created_at;
                            const latestDate = latest.crawledAt || latest.crawled_at || latest.created_at;
                            if (!latestDate) return page;
                            if (!pageDate) return latest;
                            return new Date(pageDate) > new Date(latestDate) ? page : latest;
                        }, pagesResponse.pages[0] as any);
                        lastActivity = latestPage.crawledAt || latestPage.crawled_at || latestPage.created_at;
                    }

                    const activeScan = activeScansMap.get(site.id);

                    // CRITICAL FIX: Only use activeScan progress if it's NOT in a terminal state
                    // This prevents the "stuck at 99%" issue when the backend still has an old scan in memory.
                    const isScanActive = activeScan &&
                        activeScan.state !== 'completed' &&
                        activeScan.state !== 'failed' &&
                        activeScan.status !== 'completed' &&
                        activeScan.status !== 'failed';

                    // Site is scanned if it has pages OR errors from past scans
                    const isScanned = totalPages > 0 || totalErrors > 0;

                    return {
                        ...site,
                        scanProgress: isScanActive ? activeScan.progress : (isScanned ? 100 : 0),
                        lastActivity: lastActivity || site.lastActivity,
                        totalPages: totalPages,
                        totalErrors: totalErrors,
                        status: site.status, // Trust the backend connection_status - don't override
                        activeScanId: isScanActive ? activeScan?.scan_id : undefined,
                        healthScore: healthResponse?.score || 0,
                        healthStatus: healthResponse?.status || 'Good',
                        scanState: (() => {
                            if (!isScanActive) return isScanned ? 'completed' : undefined;
                            const rawState = (activeScan.state || activeScan.status || '').toLowerCase();
                            if (rawState === 'running') return 'in_progress';
                            if (rawState === 'paused') return 'paused';
                            if (rawState === 'completed') return 'completed';
                            if (rawState === 'failed') return 'failed';
                            return undefined;
                        })() as Site['scanState'],
                    };
                } catch (error) {
                    console.error(`Failed to enrich site ${site.id}:`, error);
                    return site;
                }
            });

            const enrichedSites = await Promise.all(enrichedSitesPromises);

            // Sort logic
            enrichedSites.sort((a, b) => {
                const timeA = a.lastActivity ? new Date(a.lastActivity).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                const timeB = b.lastActivity ? new Date(b.lastActivity).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                return timeB - timeA;
            });

            setSites(enrichedSites);

            // Stats Aggregation
            let total404s = 0;
            let totalPagesCount = 0;
            let scannedSitesCount = 0;

            enrichedSites.forEach(site => {
                total404s += site.totalErrors || 0;
                totalPagesCount += site.totalPages || 0;
                if (site.status === 'connected') scannedSitesCount++;
            });

            setStats({
                totalSites: sitesResponse.sites.length,
                total404s: total404s,
                totalPages: totalPagesCount,
                scanCoverage: sitesResponse.sites.length > 0 ? Math.round((scannedSitesCount / sitesResponse.sites.length) * 100) : 0
            });

            setLastFetched(Date.now());

            // Activity Generation (Simplified to local regeneration based on site data)
            const siteActivities: Activity[] = [];
            enrichedSites.forEach(site => {
                if (site.createdAt) {
                    siteActivities.push({
                        id: `add-${site.id}`,
                        type: 'add' as const,
                        siteName: site.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
                        siteUrl: site.url,
                        timestamp: site.createdAt,
                    });
                }
                if (site.lastActivity) {
                    siteActivities.push({
                        id: `scan-${site.id}`,
                        type: 'scan' as const,
                        siteName: site.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
                        siteUrl: site.url,
                        timestamp: site.lastActivity,
                        details: `${site.totalErrors || 0} issues found`,
                    });
                }
            });

            // Fetch Real Notifications
            let realNotifications: Activity[] = [];
            try {
                const notifRes = await getUserNotifications(token, user.id);
                if (notifRes.success) {
                    realNotifications = notifRes.notifications.map(n => ({
                        id: n.id,
                        type: n.type as any,
                        siteName: 'Site Update',
                        siteUrl: '',
                        timestamp: n.created_at,
                        details: n.message
                    }));
                }
            } catch (err) {
                console.error("Failed to fetch notifications:", err);
            }

            const sortedActivities = [...siteActivities, ...realNotifications]
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 10);
            setActivities(sortedActivities);

        } catch (error) {
            console.error("Failed to refresh dashboard data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const addActivity = (activity: Activity) => {
        setActivities(prev => [activity, ...prev].slice(0, 5));
    };

    // Initial load, cache handling, and polling
    useEffect(() => {
        let intervalId: NodeJS.Timeout;

        if (isAuthenticated && user?.id) {
            // Cache validity check - reduce cache to 1 minute for fresher data
            const CACHE_DURATION = 1 * 60 * 1000; // 1 minute
            const timeSinceLastFetch = Date.now() - lastFetched;

            // Always fetch on first load (lastFetched === 0) or if cache expired
            if (lastFetched === 0 || timeSinceLastFetch > CACHE_DURATION) {
                refreshData();
            } else {
                setIsLoading(false);
            }

            // Poll every 30 seconds to keep data fresh (especially for plugin status)
            intervalId = setInterval(() => {
                refreshData();
            }, 30000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isAuthenticated, user?.id]);

    return (
        <DashboardContext.Provider value={{ sites, stats, activities, isLoading, refreshData, addActivity }}>
            {children}
        </DashboardContext.Provider>
    );
}
