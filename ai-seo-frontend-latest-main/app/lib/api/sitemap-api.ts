import { authRequest, ApiError } from "./config";

export interface SitemapSuggestion {
    id: string;
    approval_status: "pending" | "approved" | "rejected";
    total_urls: number;
    created_at: string;
    reviewed_at: string | null;
}

export interface GetSitemapSuggestionsResponse {
    success: boolean;
    suggestions: SitemapSuggestion[];
    error?: string;
}

export interface CheckSitemapPluginsResponse {
    success: boolean;
    plugins_detected: boolean;
    plugins: string[];
    message: string;
    error?: string;
}

export interface GenerateSitemapSuggestionResponse {
    success: boolean;
    message: string;
    total_urls?: number;
    urls?: string[];
    error?: string;
}

export interface UpdateSitemapStatusResponse {
    success: boolean;
    message: string;
    data?: any;
    error?: string;
}

/**
 * Check if the site has any active SEO plugins that conflict with our sitemap
 */
export async function checkSitemapPlugins(token: string, siteId: string): Promise<CheckSitemapPluginsResponse> {
    const data = await authRequest<CheckSitemapPluginsResponse>(`/sitemap/check-plugins?siteId=${siteId}`, token);
    return data;
}

/**
 * Generate a new sitemap suggestion
 */
export async function generateSitemapSuggestion(token: string, siteId: string): Promise<GenerateSitemapSuggestionResponse> {
    const data = await authRequest<GenerateSitemapSuggestionResponse>("/sitemap/generate-suggestion", token, {
        method: "POST",
        body: JSON.stringify({ siteId })
    });
    return data;
}

/**
 * Get all sitemap suggestions for a site
 */
export async function getSitemapSuggestions(token: string, siteId: string): Promise<GetSitemapSuggestionsResponse> {
    const data = await authRequest<GetSitemapSuggestionsResponse>(`/sitemap/suggestions?siteId=${siteId}`, token);
    return data;
}

/**
 * Approve or reject a sitemap suggestion
 */
export async function updateSitemapStatus(
    token: string,
    siteId: string,
    suggestionId: string,
    action: "approve" | "reject" | "pending"
): Promise<UpdateSitemapStatusResponse> {
    const data = await authRequest<UpdateSitemapStatusResponse>(`/sitemap/suggestions/${suggestionId}/status`, token, {
        method: "POST",
        body: JSON.stringify({ action, siteId })
    });
    return data;
}
