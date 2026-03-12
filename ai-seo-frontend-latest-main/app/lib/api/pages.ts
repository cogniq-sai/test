/**
 * Pages API - For fetching page data from sites
 */
import { apiRequest } from "./config";

export interface PageData {
    id: string;
    url: string;
    sourceUrl?: string;
    suggestedTarget?: string;
    confidence?: number;
    aiReasoning?: string;
    status?: "pending" | "approved" | "rejected";
    detectedAt?: string;
    crawledAt?: string;
    title?: string;
    statusCode?: number;
}

export interface GetAllPagesResponse {
    success: boolean;
    site_id: string;
    total_pages: number;
    pages: PageData[];
}

/**
 * Get all pages for a site
 */
export async function getAllPages(siteId: string): Promise<GetAllPagesResponse> {
    try {
        const data = await apiRequest<GetAllPagesResponse>(
            `/sites/${siteId}/all-pages`
        );
        return data;
    } catch (error) {
        console.error("Failed to fetch pages:", error);
        return {
            success: false,
            site_id: siteId,
            total_pages: 0,
            pages: []
        };
    }
}
