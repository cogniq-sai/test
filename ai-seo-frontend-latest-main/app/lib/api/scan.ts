import { authRequest } from "./config";

export interface StartScanRequest {
    site_id: string;
    url: string;
    max_pages?: number;
}

export interface StartScanResponse {
    status: string;
    scan_id: string;
    message?: string;
}

export interface ScanStatusResponse {
    scan_id: string;
    state: "queued" | "running" | "completed" | "failed" | "cancelled" | "paused";
    progress: number;
    pages_crawled: number;
    errors_found: number;
    error_message?: string;
    created_at: string;
}

export interface ScanError {
    id: string;
    source_url: string;
    broken_url: string;
    anchor_text: string;
    status_code: number;
    error_type: "internal" | "external" | "plain";
    created_at: string;
}

export interface GetScanErrorsResponse {
    success: boolean;
    site_id: string;
    total_errors: number;
    errors: ScanError[];
    message?: string;
}

/**
 * Start a new site scan
 */
export async function startScan(token: string, data: StartScanRequest): Promise<StartScanResponse> {
    return authRequest<StartScanResponse>("/scan", token, {
        method: "POST",
        body: JSON.stringify(data),
    });
}

/**
 * Get the status of an active scan
 */
export async function getScanStatus(token: string, scanId: string): Promise<ScanStatusResponse> {
    return authRequest<ScanStatusResponse>(`/scan/${scanId}/status`, token);
}

/**
 * Get all errors found for a site
 */
export async function getScanErrors(token: string, siteId: string): Promise<GetScanErrorsResponse> {
    return authRequest<GetScanErrorsResponse>(`/scan/${siteId}/errors`, token);
}

/**
 * Cancel a running scan
 */
export async function cancelScan(token: string, scanId: string): Promise<any> {
    return authRequest<any>(`/scan/${scanId}`, token, {
        method: "DELETE",
    });
}

export interface ActiveScan {
    scan_id: string;
    site_id: string;
    status: string; // Keep for backward compatibility if needed
    state: "queued" | "running" | "completed" | "failed" | "cancelled" | "paused";
    progress: number;
    pages_crawled: number;
    created_at: string;
    completed_at?: string;
}

export interface GetActiveScansResponse {
    active_scans: ActiveScan[];
    count: number;
}

/**
 * Get all current active scans
 */
export async function getAllActiveScans(token: string): Promise<GetActiveScansResponse> {
    return authRequest<GetActiveScansResponse>("/scan/all", token);
}

export interface PauseScanResponse {
    status: string;
    message: string;
}

export interface ResumeScanResponse {
    status: string;
    message: string;
}

/**
 * Pause an active scan
 */
export async function pauseScan(token: string, scanId: string): Promise<PauseScanResponse> {
    return authRequest<PauseScanResponse>(`/scan/${scanId}/pause`, token, {
        method: "POST",
    });
}

/**
 * Resume a paused scan
 */
export async function resumeScan(token: string, scanId: string): Promise<ResumeScanResponse> {
    return authRequest<ResumeScanResponse>(`/scan/${scanId}/resume`, token, {
        method: "POST",
    });
}
