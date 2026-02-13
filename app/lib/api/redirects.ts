import { authRequest } from "./config";

// =====================
// Types
// =====================

export interface RedirectSuggestion {
    id: string;
    site_id: string;
    broken_url: string;
    source_url: string;
    anchor_text: string;
    primary_url: string;
    primary_confidence: number;
    primary_reason: string;
    primary_redirect_type: string;
    alternative_url: string | null;
    alternative_confidence: number | null;
    alternative_reason: string | null;
    alternative_redirect_type: string | null;
    selected_option: string | null;
    custom_redirect_url: string | null;
    status: "pending" | "approved" | "rejected" | "applied" | "reverted" | "undone" | "failed";
    created_at: string;
    updated_at: string;
    applied_at: string | null;
}

export interface GenerateRedirectsResponse {
    success: boolean;
    message: string;
    total_broken_links: number;
    suggestions_generated: number;
}

export interface GetSuggestionsResponse {
    success: boolean;
    site_id: string;
    total: number;
    suggestions: RedirectSuggestion[];
    message?: string;
}

export interface SelectRedirectResponse {
    success: boolean;
    suggestion_id: string;
    selected_option: string;
    status: string;
    message: string;
}

export interface ApplyRedirectsResponse {
    success: boolean;
    applied_count: number;
    message: string;
}

// =====================
// API Functions
// =====================

/**
 * Trigger AI generation of redirect suggestions for broken links
 */
export async function generateRedirects(
    token: string,
    siteId: string,
    scanId?: string
): Promise<GenerateRedirectsResponse> {
    return authRequest<GenerateRedirectsResponse>("/redirects/generate", token, {
        method: "POST",
        body: JSON.stringify({
            site_id: siteId,
            ...(scanId ? { scan_id: scanId } : {}),
        }),
    });
}

/**
 * Fetch AI-generated redirect suggestions for a site
 */
export async function getRedirectSuggestions(
    token: string,
    siteId: string,
    status?: string
): Promise<GetSuggestionsResponse> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    return authRequest<GetSuggestionsResponse>(
        `/redirects/${siteId}/suggestions${qs ? `?${qs}` : ""}`,
        token
    );
}

/**
 * Select which redirect option to use (primary, alternative, custom, or rejected)
 */
export async function selectRedirectOption(
    token: string,
    suggestionId: string,
    selectedOption: "primary" | "alternative" | "custom" | "rejected",
    customRedirectUrl?: string
): Promise<SelectRedirectResponse> {
    return authRequest<SelectRedirectResponse>(
        `/redirects/${suggestionId}/select`,
        token,
        {
            method: "PUT",
            body: JSON.stringify({
                selected_option: selectedOption,
                ...(customRedirectUrl ? { custom_redirect_url: customRedirectUrl } : {}),
            }),
        }
    );
}

/**
 * Mark redirect suggestions as applied
 */
export async function applyRedirects(
    token: string,
    siteId: string,
    suggestionIds: string[]
): Promise<ApplyRedirectsResponse> {
    return authRequest<ApplyRedirectsResponse>(
        `/redirects/${siteId}/apply`,
        token,
        {
            method: "POST",
            body: JSON.stringify({ suggestion_ids: suggestionIds }),
        }
    );
}

/**
 * Reject a redirect suggestion
 */
export async function rejectSuggestion(
    token: string,
    suggestionId: string
): Promise<{ success: boolean; message: string }> {
    return authRequest<{ success: boolean; message: string }>(
        `/redirects/${suggestionId}`,
        token,
        { method: "DELETE" }
    );
}

/**
 * Explicitly approve a redirect suggestion (used for custom URLs that don't auto-approve)
 */
export async function approveRedirect(
    token: string,
    suggestionId: string
): Promise<SelectRedirectResponse> {
    return authRequest<SelectRedirectResponse>(
        `/redirects/${suggestionId}/approve`,
        token,
        { method: "PUT" }
    );
}

/**
 * Undo an applied/approved redirect (sets status to 'reverted')
 * Plugin will deactivate it on next sync
 */
export async function undoRedirect(
    token: string,
    suggestionId: string
): Promise<{ success: boolean; message: string }> {
    return authRequest<{ success: boolean; message: string }>(
        `/redirects/${suggestionId}/undo`,
        token,
        { method: "PUT" }
    );
}
