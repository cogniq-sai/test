/**
 * API Index - Re-export all API modules
 */
export { API_BASE_URL, ApiError, apiRequest, authRequest } from "./config";
export { login, signup } from "./auth";
export type { LoginResponse, SignupResponse } from "./auth";
export { getSites, addSite, deleteSite, removeStoredSite } from "./sites";
export type { Site, GetSitesResponse, AddSiteResponse, DeleteSiteResponse } from "./sites";
export { getAllPages } from "./pages";
export type { PageData, GetAllPagesResponse } from "./pages";
export { startScan, getScanStatus, getScanErrors, cancelScan, getAllActiveScans, pauseScan, resumeScan } from "./scan";
export type { StartScanRequest, StartScanResponse, ScanStatusResponse, ScanError, GetScanErrorsResponse, ActiveScan, GetActiveScansResponse, PauseScanResponse, ResumeScanResponse } from "./scan";
export { generateRedirects, getRedirectSuggestions, selectRedirectOption, applyRedirects, rejectSuggestion } from "./redirects";
export type { RedirectSuggestion, GenerateRedirectsResponse, GetSuggestionsResponse, SelectRedirectResponse, ApplyRedirectsResponse } from "./redirects";
