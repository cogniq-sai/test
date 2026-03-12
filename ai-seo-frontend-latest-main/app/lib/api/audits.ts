import { authRequest } from "./config";

export interface AuditRecommendation {
    priority: "High" | "Medium" | "Low";
    field?: "title" | "description" | "h1";
    current_value?: string;
    suggested_value?: string;
    reasoning?: string;
    issue?: string;
    suggestion?: string;
}

export interface PageAudit {
    url: string;
    recommendations: AuditRecommendation[];
}

export interface AnalyzePageResponse {
    url: string;
    audit: PageAudit;
    cached?: boolean;
}

export interface MetadataFixRequest {
    site_id: string;
    page_url: string;
    field: string;
    current_value?: string;
    suggested_value: string;
}

export interface MetadataFixResponse {
    success: boolean;
    optimization_id?: string;
    message: string;
}

/**
 * Trigger an AI audit for a specific page
 */
export async function analyzePage(token: string, url: string, siteId: string): Promise<AnalyzePageResponse> {
    return authRequest<AnalyzePageResponse>("/api/audits/analyze-page", token, {
        method: "POST",
        body: JSON.stringify({ url, site_id: siteId })
    });
}

/**
 * Apply an SEO fix (One-Click Fix)
 */
export async function applyFix(token: string, request: MetadataFixRequest): Promise<MetadataFixResponse> {
    return authRequest<MetadataFixResponse>("/api/audits/apply-fix", token, {
        method: "POST",
        body: JSON.stringify(request)
    });
}

/**
 * Get all AI recommendations for a site (Batch)
 */
export async function getSiteAudits(token: string, siteId: string): Promise<PageAudit[]> {
    return authRequest<PageAudit[]>(`/api/audits/site/${siteId}`, token);
}
