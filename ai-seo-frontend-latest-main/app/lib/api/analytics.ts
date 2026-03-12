import { authRequest } from "./config";

export interface HealthMetrics {
    missing_titles: number;
    missing_descriptions: number;
    missing_h1s: number;
    healthy_pages: number;
}

export interface SiteHealthResponse {
    score: number;
    status: string;
    total_pages: number;
    total_errors: number;
    metrics: HealthMetrics;
    history: {
        score: number;
        created_at: string;
    }[];
}

/**
 * Fetches health metrics for a specific site
 */
export async function getSiteHealth(token: string, siteId: string): Promise<SiteHealthResponse> {
    return authRequest<SiteHealthResponse>(`/api/analytics/site/${siteId}/health`, token);
}

/**
 * Generates a comprehensive SEO report for a site
 */
export async function getSiteReport(token: string, siteId: string): Promise<any> {
    return authRequest<any>(`/api/analytics/site/${siteId}/report`, token);
}
