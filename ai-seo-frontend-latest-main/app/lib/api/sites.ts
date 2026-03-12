/**
 * Sites API
 */
import { apiRequest, authRequest } from "./config";

export interface Site {
    id: string;
    url: string;
    apiKey: string;
    status: "connected" | "disconnected" | "pending";
    lastActivity?: string;
    createdAt: string;
    totalPages?: number;
    totalErrors?: number;
    scanProgress?: number; // 0-100 for demo purposes
    activeScanId?: string;
    scanState?: "completed" | "in_progress" | "failed" | "pending" | "paused";
    completedAt?: string;
    pagesCrawled?: number;
    healthScore?: number;
    healthStatus?: string;
}

export interface GetSitesResponse {
    success: boolean;
    sites: Site[];
    count: number;
}

export interface AddSiteResponse {
    success: boolean;
    site_id: string;
    api_key: string;
    message?: string;
}

export interface DeleteSiteResponse {
    success: boolean;
    message?: string;
}

export async function getSites(userId: string): Promise<GetSitesResponse> {
    try {
        const data = await apiRequest<{
            success: boolean;
            sites: Array<{
                site_id: string;
                site_url: string;
                api_key: string;
                connection_status: string;
                last_verified_at?: string;
                created_at?: string;
                total_pages?: number;
                total_404s?: number;
            }>;
        }>(`/sites/list/${userId}`);

        console.log(`[API] Raw sites response for user ${userId}:`, data.sites?.map(s => ({ id: s.site_id, hasKey: !!s.api_key, fields: Object.keys(s) })));

        const sites: Site[] = (data.sites || []).map((site) => ({
            id: site.site_id,
            url: site.site_url,
            apiKey: site.api_key,
            status: site.connection_status as Site["status"],
            lastActivity: site.last_verified_at,
            createdAt: site.created_at || new Date().toISOString(),
            totalPages: site.total_pages || 0,
            totalErrors: site.total_404s || 0,
        }));

        return { success: true, sites, count: sites.length };
    } catch {
        return { success: false, sites: [], count: 0 };
    }
}

export async function addSite(
    token: string,
    siteUrl: string,
    userId: string
): Promise<AddSiteResponse> {
    const normalizedUrl = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const siteName = new URL(normalizedUrl).hostname.replace(/^www\./, "");

    return authRequest<AddSiteResponse>("/sites/register", token, {
        method: "POST",
        body: JSON.stringify({
            site_url: normalizedUrl,
            user_id: userId,
            site_name: siteName,
        }),
    });
}

export async function deleteSite(
    token: string,
    siteId: string
): Promise<DeleteSiteResponse> {
    return authRequest<DeleteSiteResponse>(`/sites/${siteId}`, token, {
        method: "DELETE",
    });
}

/**
 * Remove a site from localStorage cache
 */
export function removeStoredSite(userId: string, siteId: string): void {
    const storageKey = `sites_${userId}`;
    try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            const sites = JSON.parse(stored) as Site[];
            const filtered = sites.filter(s => s.id !== siteId);
            localStorage.setItem(storageKey, JSON.stringify(filtered));
        }
    } catch {
        // Ignore localStorage errors
    }
}
