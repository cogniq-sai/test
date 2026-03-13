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
export { generateRedirects, getRedirectSuggestions, selectRedirectOption, applyRedirects, rejectSuggestion, approveRedirect, undoRedirect } from "./redirects";
export type { RedirectSuggestion, GenerateRedirectsResponse, GetSuggestionsResponse, SelectRedirectResponse, ApplyRedirectsResponse } from "./redirects";

export { checkSitemapPlugins, generateSitemapSuggestion, getSitemapSuggestions, updateSitemapStatus } from "./sitemap-api";
export type { SitemapSuggestion, CheckSitemapPluginsResponse, GenerateSitemapSuggestionResponse, GetSitemapSuggestionsResponse, UpdateSitemapStatusResponse } from "./sitemap-api";

export { getSiteHealth, getSiteReport } from "./analytics";
export type { SiteHealthResponse, HealthMetrics } from "./analytics";

export { analyzePage, getSiteAudits, applyFix } from "./audits";
export type { AuditRecommendation, PageAudit, AnalyzePageResponse, MetadataFixRequest } from "./audits";

export { getUserNotifications, markNotificationRead } from "./notifications";
export type { Notification, GetNotificationsResponse as NotificationsResponse } from "./notifications";
