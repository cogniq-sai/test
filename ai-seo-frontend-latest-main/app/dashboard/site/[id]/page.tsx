"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../context/AuthContext";
import { useDashboard } from "../../../context/DashboardContext";
import RedirectTable from "../../../components/dashboard/RedirectTable";
import { getSites, deleteSite, removeStoredSite, getScanErrors, getAllPages, generateRedirects, getRedirectSuggestions, selectRedirectOption, rejectSuggestion, approveRedirect, undoRedirect, getAllActiveScans, getSiteAudits, analyzePage, getSiteHealth, getSiteReport, applyFix } from "../../../lib/api";
import type { PageAudit, AuditRecommendation, RedirectSuggestion, MetadataFixRequest } from "../../../lib/api";
import { checkSitemapPlugins, generateSitemapSuggestion, getSitemapSuggestions, updateSitemapStatus } from "../../../lib/api/sitemap-api";
import type { SitemapSuggestion } from "../../../lib/api/sitemap-api";
import ScannerCard from "../../../components/dashboard/ScannerCard";
import PluginSetupModal from "../../../components/dashboard/PluginSetupModal";
import HealthTrendsChart from "../../../components/dashboard/HealthTrendsChart";

interface SiteInfo {
    id: string;
    url: string;        // Original full URL for API calls
    displayUrl: string; // Clean URL for UI display
    status: "connected" | "pending" | "disconnected";
    apiKey: string;
}

interface CrawledPage {
    url: string;
    title?: string;
    statusCode: number;
    crawledAt?: string;
}

type ScanState = "idle" | "scanning" | "completed";
type AiAnalysisState = "idle" | "analyzing" | "completed" | "error";

export default function SiteDashboardPage() {
    const router = useRouter();
    const params = useParams();
    const { user, token, isAuthenticated, isLoading, isInitializing } = useAuth();
    const { refreshData } = useDashboard();
    const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
    const [scanState, setScanState] = useState<ScanState>("idle");
    const [scanProgress, setScanProgress] = useState(0);
    const [pages, setPages] = useState<CrawledPage[]>([]);
    const [isPagesExpanded, setIsPagesExpanded] = useState(false);
    const [isRedirectsExpanded, setIsRedirectsExpanded] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [activeScanId, setActiveScanId] = useState<string | null>(null);

    // Plugin connection state
    const [pluginConnected, setPluginConnected] = useState(false);
    const [showPluginModal, setShowPluginModal] = useState(false);

    // AI Redirect Suggestions state
    const [aiAnalysisState, setAiAnalysisState] = useState<AiAnalysisState>("idle");
    const [aiSuggestions, setAiSuggestions] = useState<RedirectSuggestion[]>([]);
    const [redirectActionLoading, setRedirectActionLoading] = useState(false);
    const [errorCount, setErrorCount] = useState(0);
    const aiPollRef = useRef<NodeJS.Timeout | null>(null);
    const [isCheckingData, setIsCheckingData] = useState(true); // Loading state for initial data check
    const [isCopied, setIsCopied] = useState(false);

    // AI SEO Audit state
    const [siteAudits, setSiteAudits] = useState<PageAudit[]>([]);
    const [siteHealth, setSiteHealth] = useState<any | null>(null);
    const [isAuditExpanded, setIsAuditExpanded] = useState(false);
    const [isAuditLoading, setIsAuditLoading] = useState(false);
    const [auditFilter, setAuditFilter] = useState<"All" | "High" | "Medium" | "Low">("All");
    const [fixingIds, setFixingIds] = useState<Record<string, boolean>>({});

    // Sitemap Optimization state
    const [sitemapSuggestions, setSitemapSuggestions] = useState<SitemapSuggestion[]>([]);
    const [sitemapLoading, setSitemapLoading] = useState(false);
    const [seoPluginsDetected, setSeoPluginsDetected] = useState(false);
    const [detectedPluginsList, setDetectedPluginsList] = useState<string[]>([]);
    const [isSitemapExpanded, setIsSitemapExpanded] = useState(false);

    // Check connection status
    const handleCheckConnection = async () => {
        if (!user?.id || !siteId) return false;
        try {
            const response = await getSites(user.id);
            const site = response.sites.find(s => s.id === siteId);
            if (site) {
                const isConnected = site.status === "connected";
                setSiteInfo({
                    id: site.id,
                    url: site.url,
                    displayUrl: site.url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
                    status: site.status as "connected" | "pending" | "disconnected",
                    apiKey: site.apiKey || "",
                });
                setPluginConnected(isConnected);
                if (isConnected) {
                    refreshData(); // Refresh global context
                }
                return isConnected;
            }
            return false;
        } catch (error) {
            console.error("Failed to check connection:", error);
            return false;
        }
    };

    // Sync pluginConnected with siteInfo
    useEffect(() => {
        if (siteInfo?.status === "connected") {
            setPluginConnected(true);
        } else {
            setPluginConnected(false);
        }
    }, [siteInfo?.status]);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const siteId = params.id as string;

    useEffect(() => {
        if (!isInitializing && !isLoading && !isAuthenticated) {
            router.push("/login");
        }
    }, [isInitializing, isLoading, isAuthenticated, router]);

    // Fetch site info from API
    useEffect(() => {
        const fetchSiteInfo = async () => {
            if (user?.id && siteId) {
                try {
                    console.log(`[Dashboard] Fetching info for site: ${siteId}`);
                    const response = await getSites(user.id);
                    console.log(`[Dashboard] Found ${response.sites.length} sites. Searching for ${siteId}...`);
                    const site = response.sites.find(s => s.id === siteId);

                    if (site) {
                        console.log(`[Dashboard] Site found: ${site.url}, apiKey: ${site.apiKey ? 'PRESENT' : 'MISSING'}`);
                        setSiteInfo({
                            id: site.id,
                            url: site.url, // Original full URL
                            displayUrl: site.url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
                            status: site.status as "connected" | "pending" | "disconnected",
                            apiKey: site.apiKey || "",
                        });
                    } else {
                        console.warn(`[Dashboard] Site ${siteId} not found in user's site list.`);
                    }
                } catch (error) {
                    console.error("Failed to fetch site info:", error);
                }
            }
        };

        if (isAuthenticated && user?.id) {
            fetchSiteInfo();
        }
    }, [siteId, user?.id, isAuthenticated]);

    // Fetch existing AI suggestions for a site
    const fetchAiSuggestions = useCallback(async () => {
        if (!siteId || !token) return;
        try {
            const response = await getRedirectSuggestions(token, siteId);
            if (response.success && response.suggestions.length > 0) {
                setAiSuggestions(response.suggestions);
                setAiAnalysisState("completed");
            }
            return true;
        } catch (error) {
            console.error("Failed to fetch AI suggestions:", error);
            return false;
        }
    }, [siteId, token]);

    // Fetch existing Sitemap suggestions and check plugins
    const fetchSitemapData = useCallback(async () => {
        if (!siteId || !token) return;
        try {
            const [pluginsRes, suggestionsRes] = await Promise.all([
                checkSitemapPlugins(token, siteId).catch(() => null),
                getSitemapSuggestions(token, siteId).catch(() => null)
            ]);

            if (pluginsRes?.success) {
                setSeoPluginsDetected(pluginsRes.plugins_detected);
                setDetectedPluginsList(pluginsRes.plugins || []);
            }

            if (suggestionsRes?.success && suggestionsRes.suggestions) {
                setSitemapSuggestions(suggestionsRes.suggestions);
            }
        } catch (error) {
            console.error("Failed to fetch Sitemap data:", error);
        }
    }, [siteId, token]);

    const fetchAuditData = useCallback(async () => {
        if (!siteId || !token) return;
        setIsAuditLoading(true);
        try {
            const [health, audits] = await Promise.all([
                getSiteHealth(token, siteId).catch(() => ({ score: 0, status: 'N/A' })),
                getSiteAudits(token, siteId).catch(() => [])
            ]);
            setSiteHealth(health);
            setSiteAudits(audits);
        } catch (error) {
            console.error("Failed to fetch Audit data:", error);
        } finally {
            setIsAuditLoading(false);
        }
    }, [siteId, token]);

    // Trigger AI generation and start polling
    const triggerAiGeneration = useCallback(async () => {
        if (!siteId || !token) return;
        try {
            setAiAnalysisState("analyzing");
            const response = await generateRedirects(token, siteId);
            if (!response.success) {
                // No broken links or error
                setAiAnalysisState("idle");
                return;
            }
            // Start polling for results
            let pollCount = 0;
            const maxPolls = 60; // 5 min max (5s * 60)
            aiPollRef.current = setInterval(async () => {
                pollCount++;
                try {
                    const suggestionsRes = await getRedirectSuggestions(token, siteId);
                    if (suggestionsRes.success && suggestionsRes.suggestions.length > 0) {
                        setAiSuggestions(suggestionsRes.suggestions);
                        setAiAnalysisState("completed");
                        setIsRedirectsExpanded(true); // Auto-open drawer when AI completes
                        if (aiPollRef.current) clearInterval(aiPollRef.current);
                    } else if (pollCount >= maxPolls) {
                        setAiAnalysisState("error");
                        if (aiPollRef.current) clearInterval(aiPollRef.current);
                    }
                } catch {
                    if (pollCount >= maxPolls) {
                        setAiAnalysisState("error");
                        if (aiPollRef.current) clearInterval(aiPollRef.current);
                    }
                }
            }, 5000);
        } catch (error) {
            console.error("Failed to trigger AI generation:", error);
            setAiAnalysisState("error");
        }
    }, [siteId, token]);

    // Cleanup AI polling on unmount
    useEffect(() => {
        return () => {
            if (aiPollRef.current) clearInterval(aiPollRef.current);
        };
    }, []);

    // Always try to fetch existing scan data when page loads
    useEffect(() => {
        const checkExistingScanData = async () => {
            if (!siteId || !token) {
                setIsCheckingData(false);
                return;
            }

            try {
                // Try to fetch existing pages, errors, active scans
                const [pagesResponse, errorsResponse, activeScansResponse] = await Promise.all([
                    getAllPages(siteId),
                    getScanErrors(token, siteId),
                    getAllActiveScans(token).catch(() => ({ active_scans: [] }))
                ]);

                // 1. Check if a scan is currently running
                const activeScan = activeScansResponse.active_scans?.find((s: any) =>
                    s.site_id === siteId && (s.state === "running" || s.state === "queued" || s.state === "paused")
                );

                if (activeScan) {
                    setScanState(activeScan.state === "paused" ? "idle" : "scanning");
                    if (activeScan.state !== "paused") {
                        setActiveScanId(activeScan.scan_id);
                    }
                    setIsCheckingData(false);
                    return; // Exit early since it's scanning
                }

                // 2. Otherwise check if there is completed data
                const hasPages = pagesResponse.success && pagesResponse.pages && pagesResponse.pages.length > 0;
                const hasErrors = errorsResponse.success && errorsResponse.errors && errorsResponse.errors.length > 0;

                // Only show completed state if there's actual data from a previous scan
                if (hasPages || hasErrors) {
                    setScanState("completed");

                    if (hasPages) {
                        const mappedPages: CrawledPage[] = pagesResponse.pages.map((p: any) => ({
                            url: p.url,
                            title: p.title,
                            statusCode: p.statusCode || p.status_code || 200,
                            crawledAt: p.crawledAt || p.crawled_at || p.created_at || p.last_updated
                        }));
                        setPages(mappedPages);
                    }

                    if (hasErrors) {
                        setErrorCount(errorsResponse.errors.length);
                    }

                    // Load existing AI suggestions
                    await fetchAiSuggestions();
                    await fetchSitemapData();
                    await fetchAuditData();
                } else if (user?.id) {
                    // Fallback: Check backend scan_status even if no pages/errors in DB
                    // This handles the case where a scan completed but DB writes failed
                    try {
                        const sitesResponse = await getSites(user.id);
                        const currentSite = sitesResponse.sites.find(s => s.id === siteId);
                        if (currentSite?.scanState === "completed" || currentSite?.totalPages && currentSite.totalPages > 0) {
                            setScanState("completed");
                        }
                    } catch (err) {
                        console.warn("Failed to check site scan status:", err);
                    }
                }
            } catch (error) {
                console.error("Failed to check existing scan data:", error);
            } finally {
                setIsCheckingData(false);
            }
        };

        if (isAuthenticated && siteId && token) {
            checkExistingScanData();
        } else {
            setIsCheckingData(false);
        }
    }, [siteId, token, isAuthenticated, fetchAiSuggestions, user?.id]);

    const fetchDiscoveredPages = async () => {
        if (!siteId) return;
        try {
            const response = await getAllPages(siteId);
            if (response.success) {
                const mappedPages: CrawledPage[] = response.pages.map((p: any) => ({
                    url: p.url,
                    title: p.title,
                    statusCode: p.statusCode || p.status_code || 200,
                    crawledAt: p.crawledAt || p.crawled_at || p.created_at || p.last_updated
                }));
                setPages(mappedPages);
            }
        } catch (error) {
            console.error("Failed to fetch discovered pages:", error);
        }
    };

    const fetchScanResults = async (): Promise<number> => {
        if (!token || !siteId) return 0;
        try {
            const response = await getScanErrors(token, siteId);
            if (response.success) {
                const count = response.errors.length;
                setErrorCount(count);
                return count;
            }
        } catch (error) {
            console.error("Failed to fetch scan results:", error);
        }
        return 0;
    };

    useEffect(() => {
        if (scanState === "completed") {
            fetchScanResults();
            fetchDiscoveredPages();
        }
    }, [scanState]);

    const handleScanComplete = async () => {
        setScanState("completed");
        const foundErrors = await fetchScanResults();
        fetchDiscoveredPages();
        refreshData();

        // Auto-trigger AI redirect generation if 404s were found
        if (foundErrors > 0) {
            triggerAiGeneration();
        }
    };

    const handleStartScan = () => {
        setScanState("scanning");
        setScanProgress(0);
        setPages([]);
        setAiSuggestions([]);
        setSitemapSuggestions([]);
        setAiAnalysisState("idle");
        setErrorCount(0);
        if (aiPollRef.current) clearInterval(aiPollRef.current);
        refreshData();
    };

    const handleDeleteSite = async () => {
        if (!token || !siteId || !user?.id) return;

        setIsDeleting(true);
        setDeleteError(null);

        try {
            await deleteSite(token, siteId);
            removeStoredSite(user.id, siteId);
            await refreshData(); // Sync with dashboard cache
            router.push("/dashboard");
        } catch (error) {
            console.error("Failed to delete site:", error);
            setDeleteError(error instanceof Error ? error.message : "Failed to delete site");
            setIsDeleting(false);
        }
    };

    const handleApprove = async (id: string, option: "primary" | "alternative") => {
        if (!token) return;
        if (!pluginConnected) { setShowPluginModal(true); return; }
        setRedirectActionLoading(true);
        try {
            await selectRedirectOption(token, id, option);
            setAiSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "approved", selected_option: option } : s));
        } catch (error) {
            console.error("Failed to approve redirect:", error);
        } finally {
            setRedirectActionLoading(false);
        }
    };

    const handleReject = async (id: string) => {
        if (!token) return;
        if (!pluginConnected) { setShowPluginModal(true); return; }
        setRedirectActionLoading(true);
        try {
            await rejectSuggestion(token, id);
            setAiSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "rejected" } : s));
        } catch (error) {
            console.error("Failed to reject redirect:", error);
        } finally {
            setRedirectActionLoading(false);
        }
    };

    const handleEditCustom = async (id: string, customUrl: string) => {
        if (!token) return;
        setRedirectActionLoading(true);
        try {
            await selectRedirectOption(token, id, "custom", customUrl);
            // Custom selections stay pending until explicitly approved
            // We update the local state so the UI shows the new custom URL immediately
            setAiSuggestions(prev => prev.map(s => s.id === id ? {
                ...s,
                status: "pending",
                selected_option: "custom",
                custom_redirect_url: customUrl
            } : s));
        } catch (error) {
            console.error("Failed to set custom redirect:", error);
        } finally {
            setRedirectActionLoading(false);
        }
    };

    const handleApproveCustom = async (id: string) => {
        if (!token) return;
        if (!pluginConnected) { setShowPluginModal(true); return; }
        setRedirectActionLoading(true);
        try {
            await approveRedirect(token, id);
            // When approving a custom URL, verify that 'custom' is the selected_option
            setAiSuggestions(prev => prev.map(s => s.id === id ? {
                ...s,
                status: "approved",
                selected_option: s.selected_option || "custom" // Ensure selected_option is set
            } : s));
        } catch (error) {
            console.error("Failed to approve custom redirect:", error);
        } finally {
            setRedirectActionLoading(false);
        }
    };

    const handleUnlink = async (id: string) => {
        if (!token) return;
        if (!pluginConnected) { setShowPluginModal(true); return; }
        setRedirectActionLoading(true);
        try {
            await selectRedirectOption(token, id, "unlinked" as any);
            setAiSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "approved", selected_option: "unlinked" } : s));
        } catch (error) {
            console.error("Failed to unlink:", error);
        } finally {
            setRedirectActionLoading(false);
        }
    };

    const handleUndo = async (id: string) => {
        if (!token) return;
        if (!pluginConnected) { setShowPluginModal(true); return; }
        setRedirectActionLoading(true);
        try {
            // Optimistic update: Show "Reverting..." immediately
            setAiSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "reverted" as const } : s));

            await undoRedirect(token, id);

            // REMOVED: Do not manually reset to pending. 
            // Let the polling logic handle the transition when backend confirms it.
            // This ensures "Reverting..." stays visible until the action is fully effectively synced.
        } catch (error) {
            console.error("Failed to undo redirect:", error);
            // Revert optimistic update on error (back to previous state?) 
            // We might not know previous state easily here without extra tracking, 
            // but refreshing data is safest.
            refreshData();
        } finally {
            setRedirectActionLoading(false);
        }
    };

    // Sitemap Layout Handlers
    const handleOptimizeSitemap = async () => {
        if (!token || !siteId) return;
        setSitemapLoading(true);
        try {
            // "Optimize" now simply generates a new approved sitemap suggestion 
            // the backend should be updated later, but for now we'll just call generate
            // and assume generation implies approval for the new one-click flow
            const res = await generateSitemapSuggestion(token, siteId);
            if (res.success) {
                // If the old backend API creates it as "pending", we should immediately approve it
                // To keep frontend isolated right now, we will approve it if urls are returned
                await fetchSitemapData();
            }
        } catch (error) {
            console.error("Failed to optimize sitemap:", error);
        } finally {
            setSitemapLoading(false);
        }
    };

    // Poll for status updates (Applying -> Live)
    // Poll for status updates (Applying -> Live)
    useEffect(() => {
        if (!token || !siteId) return;

        // Check if we have any items in "Applying" (approved) or "Reverting" (reverted) state
        const pendingItems = aiSuggestions.filter(s => s.status === 'approved' || s.status === 'reverted');

        if (pendingItems.length === 0) return;

        const intervalId = setInterval(async () => {
            try {
                // Fetch latest suggestions to get updated statuses
                const response = await getRedirectSuggestions(token, siteId);
                if (response.success && response.suggestions) {
                    setAiSuggestions(response.suggestions);
                }
            } catch (error) {
                console.error("Polling error:", error);
            }
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(intervalId);
    }, [aiSuggestions, token, siteId]);

    // Calculate stats
    const stats = {
        totalPages: pages.length,
        total404s: errorCount,
        aiSuggestionsCount: aiSuggestions.length,
        pendingReviews: aiSuggestions.filter(s => s.status === "pending").length,
        approved: aiSuggestions.filter(s => s.status === "approved").length,
        rejected: aiSuggestions.filter(s => s.status === "rejected").length,
        noindexCount: pages.filter((p: any) => p.is_noindex === true).length
    };

    if (isInitializing || isLoading || isCheckingData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="text-gray-600">Loading site data...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/dashboard"
                            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div className="h-6 w-px bg-gray-200"></div>
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">AI Redirect Review</h1>
                            <p className="text-xs text-gray-500">Review and approve AI-suggested redirects to fix broken links and protect SEO</p>
                        </div>
                    </div>
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold text-gray-900">
                            AutoRankr <span className="text-blue-600">AI</span>
                        </span>
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Site Info Hero Section */}
                <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/50 border border-white/60 p-6 mb-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-4">
                            {/* Site Icon */}
                            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
                                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">{siteInfo?.displayUrl || "Loading..."}</h2>
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full ${scanState === "scanning"
                                        ? "bg-blue-100 text-blue-700"
                                        : scanState === "completed"
                                            ? "bg-green-100 text-green-700"
                                            : "bg-blue-100 text-blue-700"
                                        }`}>
                                        <span className={`w-2 h-2 rounded-full ${scanState === "scanning"
                                            ? "bg-blue-500 animate-pulse"
                                            : scanState === "completed"
                                                ? "bg-green-500"
                                                : "bg-blue-500"
                                            }`}></span>
                                        {scanState === "scanning" ? "Scanning..." : scanState === "completed" ? "Scan Complete" : "Ready to Scan"}
                                    </span>
                                    {pluginConnected ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 border border-green-200">
                                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                            Plugin Online
                                        </span>
                                    ) : (scanState === "completed" && aiSuggestions.length > 0 && siteInfo?.apiKey) ? (
                                        <span
                                            className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
                                            onClick={() => {
                                                if (siteInfo.apiKey) {
                                                    navigator.clipboard.writeText(siteInfo.apiKey);
                                                    setIsCopied(true);
                                                    setTimeout(() => setIsCopied(false), 2000);
                                                }
                                            }}
                                            title="Click to copy API key"
                                        >
                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                            Plugin Offline
                                            <span className="text-amber-500">•</span>
                                            <span className="font-mono text-amber-600">{siteInfo.apiKey.slice(0, 8)}…</span>
                                            {isCopied ? (
                                                <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : (
                                                <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
                                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2" />
                                                </svg>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="text-sm text-gray-500">
                                            AI-powered 404 detection and redirect suggestions
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Delete Site Button */}
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all hover:shadow-md self-start md:self-center"
                            title="Delete this site"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete Site
                        </button>
                    </div>
                </div>

                {/* ===== SCANNING SECTION ===== */}
                {(scanState === "idle" || scanState === "scanning") && siteInfo && (
                    <div className="mb-8">
                        <ScannerCard
                            siteId={siteId}
                            siteUrl={siteInfo.url}
                            token={token || ""}
                            initialScanId={activeScanId}
                            onScanComplete={handleScanComplete}
                        />
                    </div>
                )}




                {/* ===== COMPLETED STATE: Show Stats & Accordions ===== */}
                {scanState === "completed" && (
                    <>
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            {/* Total 404s */}
                            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Total 404s</p>
                                        <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total404s}</p>
                                    </div>
                                    <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-400 rounded-xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Pending Reviews */}
                            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Pending Reviews</p>
                                        <p className="text-3xl font-bold text-yellow-600 mt-2">{stats.pendingReviews}</p>
                                    </div>
                                    <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-amber-400 rounded-xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Approved */}
                            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Approved</p>
                                        <p className="text-3xl font-bold text-green-600 mt-2">{stats.approved}</p>
                                    </div>
                                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-400 rounded-xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Rejected */}
                            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Rejected</p>
                                        <p className="text-3xl font-bold text-red-600 mt-2">{stats.rejected}</p>
                                    </div>
                                    <div className="w-12 h-12 bg-gradient-to-br from-gray-500 to-gray-400 rounded-xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ===== AI ANALYZING BANNER ===== */}
                        {aiAnalysisState === "analyzing" && (
                            <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-cyan-50 backdrop-blur-xl rounded-2xl shadow-lg shadow-purple-200/30 border border-purple-100/60 p-6 mb-6 overflow-hidden relative">
                                {/* Animated background shimmer */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse" style={{ animationDuration: '2s' }}></div>
                                <div className="relative flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25 flex-shrink-0">
                                        <svg className="w-6 h-6 text-white animate-spin" style={{ animationDuration: '2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                                            AI is analyzing your broken links
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                                                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></span>
                                                Processing
                                            </span>
                                        </h3>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Generating intelligent redirect suggestions for {errorCount} broken link{errorCount !== 1 ? 's' : ''}. This may take a moment...
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {aiAnalysisState === "error" && (
                            <div className="bg-red-50 rounded-2xl shadow-lg border border-red-100 p-6 mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-base font-semibold text-red-900">AI analysis encountered an issue</h3>
                                        <p className="text-sm text-red-700 mt-1">Suggestions may still be generating. You can try again or check back later.</p>
                                    </div>
                                    <button
                                        onClick={triggerAiGeneration}
                                        className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-xl transition-colors"
                                    >
                                        Retry
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ===== ACCORDION: AI SEO Audit ===== */}
                        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/50 border border-white/60 overflow-hidden mb-6">
                            <div
                                className="p-5 cursor-pointer hover:bg-gray-50/80 transition-all duration-200"
                                onClick={() => setIsAuditExpanded(!isAuditExpanded)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-500/20">
                                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-base font-semibold text-gray-900">AI SEO Audit</h3>
                                                {siteHealth && (
                                                    <div className="flex items-center gap-3">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                            siteHealth.score > 80 ? 'bg-emerald-100 text-emerald-700' : 
                                                            siteHealth.score > 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                                        }`}>
                                                            Health Score: {siteHealth.score}/100
                                                        </span>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                // Simple JSON download for now
                                                                const handleDownload = async () => {
                                                                    try {
                                                                        const report = await getSiteReport(token || "", siteId);
                                                                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
                                                                        const downloadAnchorNode = document.createElement('a');
                                                                        downloadAnchorNode.setAttribute("href", dataStr);
                                                                        downloadAnchorNode.setAttribute("download", `seo_report_${siteId}.json`);
                                                                        document.body.appendChild(downloadAnchorNode);
                                                                        downloadAnchorNode.click();
                                                                        downloadAnchorNode.remove();
                                                                    } catch (err) {
                                                                        console.error("Download failed:", err);
                                                                        alert("Failed to generate report");
                                                                    }
                                                                };
                                                                handleDownload();
                                                            }}
                                                            className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            EXPORT DATA
                                                        </button>
                                                        <Link
                                                            href={`/dashboard/site/${siteId}/report`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-100"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                            VIEW REPORT
                                                        </Link>
                                                    </div>
                                                )}
                                            </div>
                                            {!isAuditExpanded && (
                                                <p className="text-sm text-gray-500 mt-0.5">
                                                    AI-driven content optimization and metadata suggestions
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <svg
                                        className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isAuditExpanded ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>

                            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isAuditExpanded ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="border-t border-gray-100 p-6">
                                    {isAuditLoading ? (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <div className="w-12 h-12 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin"></div>
                                            <p className="mt-4 text-gray-500">Retrieving AI insights...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            {/* Health Trends */}
                                            {siteHealth?.history && siteHealth.history.length > 0 && (
                                                <div className="mb-2">
                                                    <HealthTrendsChart history={siteHealth.history} />
                                                </div>
                                            )}

                                            {/* Health Summary */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</p>
                                                    <p className="text-lg font-bold text-slate-900">{siteHealth?.status || 'Active'}</p>
                                                </div>
                                                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 col-span-2">
                                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">AI Recommendation</p>
                                                    <p className="text-sm text-slate-700">
                                                        {siteHealth && siteHealth.score > 90 
                                                            ? "Your site has excellent SEO health! Regular monitoring will help maintain this." 
                                                            : "Focus on fixing missing H1 tags and meta descriptions to improve your search visibility."}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Top Recommendations */}
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                    Prioritized SEO Actions
                                                </h4>
                                                
                                                {/* Priority Filters */}
                                                <div className="flex gap-2 mb-4">
                                                    {(["All", "High", "Medium", "Low"] as const).map((p) => (
                                                        <button
                                                            key={p}
                                                            onClick={() => setAuditFilter(p)}
                                                            className={`px-3 py-1 text-xs font-bold rounded-full transition-all border ${
                                                                auditFilter === p 
                                                                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm' 
                                                                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-200 hover:text-purple-600'
                                                            }`}
                                                        >
                                                            {p}
                                                        </button>
                                                    ))}
                                                </div>
                                                
                                                {siteAudits.length === 0 ? (
                                                    <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                                        <p className="text-gray-500 text-sm">No critical content issues identified by AI yet.</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {siteAudits
                                                            .flatMap(audit => audit.recommendations)
                                                            .filter(rec => auditFilter === "All" || rec.priority === auditFilter)
                                                            .slice(0, 5)
                                                            .map((rec, i) => {
                                                                const auditItem = siteAudits.find(a => a.recommendations.includes(rec));
                                                                const pageUrl = auditItem?.url || "";
                                                                const fixKey = `${pageUrl}-${rec.field}`;
                                                                const isFixing = fixingIds[fixKey];
                                                                const canFix = !!(rec.field && rec.suggested_value && pluginConnected);

                                                                return (
                                                                    <div key={i} className="flex gap-4 p-4 rounded-xl border border-gray-100 bg-white hover:shadow-md transition-shadow group">
                                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                                            rec.priority === 'High' ? 'bg-red-50 text-red-600' : 
                                                                            rec.priority === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                                                                        }`}>
                                                                            <span className="text-[10px] font-bold">{rec.priority[0]}</span>
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <h5 className="text-sm font-semibold text-gray-900">{rec.issue || `Optimize ${rec.field}`}</h5>
                                                                            <p className="text-xs text-gray-600 mt-1">{rec.suggestion || rec.reasoning}</p>
                                                                            {rec.suggested_value && (
                                                                                <div className="mt-2 text-[10px] p-2 bg-slate-50 rounded border border-slate-100 font-mono text-slate-600">
                                                                                    Suggest: {rec.suggested_value}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {canFix && (
                                                                            <div className="flex-shrink-0 self-center">
                                                                                <button
                                                                                    onClick={() => handleApplyFix(rec, pageUrl)}
                                                                                    disabled={isFixing}
                                                                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                                                                                        isFixing 
                                                                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                                                                            : 'bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white border border-purple-200 shadow-sm'
                                                                                    }`}
                                                                                >
                                                                                    {isFixing ? (
                                                                                        <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                                                                                    ) : (
                                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                                        </svg>
                                                                                    )}
                                                                                    {isFixing ? 'Fixing...' : 'Fix Now'}
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ===== ACCORDION 2: Crawled Pages ===== */}
                        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/50 border border-white/60 overflow-hidden mb-6">
                            {/* Accordion Header */}
                            <div
                                className="p-5 cursor-pointer hover:bg-gray-50/80 transition-all duration-200"
                                onClick={() => setIsPagesExpanded(!isPagesExpanded)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        {/* Section Icon */}
                                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center flex-shrink-0">
                                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-base font-semibold text-gray-900">Crawled Pages</h3>
                                                {pages.length > 0 && (
                                                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-md">
                                                        {stats.totalPages}
                                                    </span>
                                                )}
                                            </div>
                                            {!isPagesExpanded && (
                                                <p className="text-sm text-gray-500 mt-0.5">
                                                    View all pages discovered on your site
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors">
                                        <svg
                                            className={`w-5 h-5 transition-transform duration-300 ${isPagesExpanded ? 'rotate-180' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Collapsible Content */}
                            <div
                                className={`transition-all duration-300 ease-in-out overflow-hidden ${isPagesExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                            >
                                <div className="border-t border-gray-100">
                                    {pages.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-2">No pages found</h3>
                                            <p className="text-gray-600 text-center max-w-md">
                                                No pages have been crawled for this site yet.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col">
                                            <div className="overflow-x-auto">
                                                {/* Table Header */}
                                                <table className="w-full">
                                                    <thead className="bg-gray-50/80">
                                                        <tr>
                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">URL Path</th>
                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Page Title</th>
                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Last Updated</th>
                                                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {pages.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((page, index) => {
                                                            const urlPath = page.url.replace(/^https?:\/\/[^\/]+/, '') || '/';
                                                            const formattedDate = page.crawledAt
                                                                ? new Date(page.crawledAt).toLocaleDateString('en-US', {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    year: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })
                                                                : '—';
                                                            const statusColor = page.statusCode >= 200 && page.statusCode < 300
                                                                ? 'bg-green-100 text-green-700'
                                                                : page.statusCode >= 300 && page.statusCode < 400
                                                                    ? 'bg-yellow-100 text-yellow-700'
                                                                    : 'bg-red-100 text-red-700';
                                                            return (
                                                                <tr
                                                                    key={index}
                                                                    className="hover:bg-gray-50/50 transition-colors group"
                                                                >
                                                                    {/* URL Path */}
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors">
                                                                                <svg className="w-4 h-4 text-gray-500 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                                </svg>
                                                                            </div>
                                                                            <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]" title={urlPath}>
                                                                                {urlPath}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    {/* Page Title */}
                                                                    <td className="px-6 py-4">
                                                                        <span className="text-sm text-gray-600 truncate max-w-[250px] block" title={page.title || '—'}>
                                                                            {page.title || '—'}
                                                                        </span>
                                                                    </td>
                                                                    {/* Status */}
                                                                    <td className="px-6 py-4">
                                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                                                                            {page.statusCode}
                                                                        </span>
                                                                    </td>
                                                                    {/* Last Updated */}
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                            </svg>
                                                                            <span>{formattedDate}</span>
                                                                        </div>
                                                                    </td>
                                                                    {/* Action */}
                                                                    <td className="px-6 py-4 text-right">
                                                                        <a
                                                                            href={page.url}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                            </svg>
                                                                            Visit
                                                                        </a>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Pagination Controls */}
                                            {pages.length > itemsPerPage && (
                                                <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between">
                                                    <div className="flex-1 flex justify-between sm:hidden">
                                                        <button
                                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                            disabled={currentPage === 1}
                                                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Previous
                                                        </button>
                                                        <button
                                                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(pages.length / itemsPerPage)))}
                                                            disabled={currentPage === Math.ceil(pages.length / itemsPerPage)}
                                                            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Next
                                                        </button>
                                                    </div>
                                                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                                        <div>
                                                            <p className="text-sm text-gray-700">
                                                                Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, pages.length)}</span> of <span className="font-medium">{pages.length}</span> results
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                                                <button
                                                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                                    disabled={currentPage === 1}
                                                                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    <span className="sr-only">Previous</span>
                                                                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                    </svg>
                                                                </button>
                                                                {/* Page Numbers */}
                                                                {[...Array(Math.ceil(pages.length / itemsPerPage))].map((_, i) => {
                                                                    const pageNum = i + 1;
                                                                    // Only show first 1, last 1, current, and adjacent to current
                                                                    if (
                                                                        pageNum === 1 ||
                                                                        pageNum === Math.ceil(pages.length / itemsPerPage) ||
                                                                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                                                                    ) {
                                                                        return (
                                                                            <button
                                                                                key={pageNum}
                                                                                onClick={() => setCurrentPage(pageNum)}
                                                                                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === pageNum
                                                                                    ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                                                                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                                                                    }`}
                                                                            >
                                                                                {pageNum}
                                                                            </button>
                                                                        );
                                                                    } else if (
                                                                        pageNum === currentPage - 2 ||
                                                                        pageNum === currentPage + 2
                                                                    ) {
                                                                        return (
                                                                            <span key={pageNum} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                                                                ...
                                                                            </span>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })}
                                                                <button
                                                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(pages.length / itemsPerPage)))}
                                                                    disabled={currentPage === Math.ceil(pages.length / itemsPerPage)}
                                                                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    <span className="sr-only">Next</span>
                                                                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                                                    </svg>
                                                                </button>
                                                            </nav>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ===== ACCORDION 1: Broken Link Review ===== */}
                        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/50 border border-white/60 overflow-hidden">
                            {/* Accordion Header */}
                            <div
                                className="p-5 cursor-pointer hover:bg-gray-50/80 transition-all duration-200"
                                onClick={() => setIsRedirectsExpanded(!isRedirectsExpanded)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        {/* Section Icon */}
                                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-400 rounded-xl flex items-center justify-center flex-shrink-0">
                                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-base font-semibold text-gray-900">Broken Link Review</h3>
                                                {aiSuggestions.length > 0 && (
                                                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 bg-orange-100 text-orange-700 text-sm font-medium rounded-md">
                                                        {stats.pendingReviews}
                                                    </span>
                                                )}
                                                {aiAnalysisState === "analyzing" && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                                                        Analyzing
                                                    </span>
                                                )}
                                            </div>
                                            {!isRedirectsExpanded && (
                                                <p className="text-sm text-gray-500 mt-0.5">
                                                    {aiSuggestions.length > 0
                                                        ? `${stats.pendingReviews} pending review · ${stats.approved} approved · ${stats.rejected} rejected`
                                                        : errorCount > 0
                                                            ? aiAnalysisState === "analyzing" ? "AI is generating suggestions..." : "Trigger AI analysis to get redirect suggestions"
                                                            : "No broken links found — your site is healthy!"
                                                    }
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {/* Manual trigger button if not already analyzing and has errors but no suggestions */}
                                        {errorCount > 0 && aiSuggestions.length === 0 && aiAnalysisState === "idle" && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    triggerAiGeneration();
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                </svg>
                                                Generate AI Suggestions
                                            </button>
                                        )}
                                        <svg
                                            className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isRedirectsExpanded ? 'rotate-180' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Collapsible Content */}
                            <div
                                className={`transition-all duration-300 ease-in-out overflow-hidden ${isRedirectsExpanded ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'}`}
                            >
                                <div className="border-t border-gray-100 p-6">
                                    {aiSuggestions.length === 0 && aiAnalysisState !== "analyzing" ? (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                                {errorCount > 0 ? "No AI suggestions generated yet" : "No broken links detected"}
                                            </h3>
                                            <p className="text-gray-600 text-center max-w-md">
                                                {errorCount > 0
                                                    ? "Click \"Generate AI Suggestions\" above to get intelligent redirect recommendations for your broken links."
                                                    : "Your site is running smoothly! No 404 errors have been detected."
                                                }
                                            </p>
                                        </div>
                                    ) : aiAnalysisState === "analyzing" && aiSuggestions.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                                                <svg className="w-8 h-8 text-purple-500 animate-spin" style={{ animationDuration: '2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI is working on it...</h3>
                                            <p className="text-gray-600 text-center max-w-md">
                                                Analyzing {errorCount} broken link{errorCount !== 1 ? 's' : ''} and generating redirect suggestions. This typically takes 10-30 seconds.
                                            </p>
                                        </div>
                                    ) : (
                                        <RedirectTable
                                            suggestions={[...aiSuggestions].sort((a, b) => {
                                                // Internal links (with AI suggestions) first, external links second
                                                const aIsInternal = !!a.primary_url;
                                                const bIsInternal = !!b.primary_url;
                                                if (aIsInternal && !bIsInternal) return -1;
                                                if (!aIsInternal && bIsInternal) return 1;
                                                return 0;
                                            })}
                                            siteUrl={siteInfo?.url}
                                            onApprove={handleApprove}
                                            onReject={handleReject}
                                            onEditCustom={handleEditCustom}
                                            onApproveCustom={handleApproveCustom}
                                            onUndo={handleUndo}
                                            onUnlink={handleUnlink}
                                            isLoading={redirectActionLoading}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                    </>
                )}

                {/* ===== ACCORDION 3: XML Sitemap Optimization ===== */}
                {scanState === "completed" && (
                    <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/50 border border-white/60 overflow-hidden mt-6 mb-6">
                        {/* Accordion Header */}
                        <div
                            className="p-5 cursor-pointer hover:bg-gray-50/80 transition-all duration-200"
                            onClick={() => setIsSitemapExpanded(!isSitemapExpanded)}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    {/* Section Icon */}
                                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-400 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-base font-semibold text-gray-900">XML Sitemap Optimization</h3>
                                            {sitemapSuggestions.filter(s => s.approval_status === "pending").length > 0 && (
                                                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-md">
                                                    Action Required
                                                </span>
                                            )}
                                        </div>
                                        {!isSitemapExpanded && (
                                            <p className="text-sm text-gray-500 mt-0.5">
                                                Automatically remove 404s and noindex pages from your XML sitemap
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors">
                                    <svg
                                        className={`w-5 h-5 transition-transform duration-300 ${isSitemapExpanded ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {/* Collapsible Content */}
                        <div
                            className={`transition-all duration-300 ease-in-out overflow-hidden ${isSitemapExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                        >
                            <div className="border-t border-gray-100 p-6 bg-gray-50/30">

                                {/* Plugin Warning Banner */}
                                {seoPluginsDetected && (
                                    <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200 shadow-sm flex gap-4 items-start">
                                        <div className="mt-1">
                                            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-amber-900">Conflicting Plugins Detected</h4>
                                            <p className="text-sm text-amber-800 mt-1">
                                                We detected the following active SEO plugins: <span className="font-semibold">{detectedPluginsList.join(", ")}</span>.
                                                Please disable their sitemap functionality to use AutoRankr AI's optimized sitemap.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Sitemap Actions & Stats */}
                                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 relative overflow-hidden">
                                    <div className="mb-6 flex flex-col md:flex-row gap-6 justify-between items-center">
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-1">Optimize Your Sitemap</h3>
                                            <p className="text-sm text-gray-600 max-w-xl">
                                                Exclude <span className="font-semibold text-gray-900">{stats.total404s} broken links</span> and <span className="font-semibold text-gray-900">{stats.noindexCount} noindex pages</span> from your sitemap to automatically improve your crawl budget.
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-center gap-2">
                                            {sitemapSuggestions.length > 0 ? (
                                                <a
                                                    href={`${siteInfo?.url.replace(/\/$/, '')}/sitemap.xml`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                    View Live Sitemap
                                                </a>
                                            ) : (
                                                <button
                                                    onClick={handleOptimizeSitemap}
                                                    disabled={sitemapLoading || !pluginConnected}
                                                    className="px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-xl transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                >
                                                    {sitemapLoading ? (
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                    ) : (
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                                                        </svg>
                                                    )}
                                                    Optimize Sitemap
                                                </button>
                                            )}
                                            {!pluginConnected && sitemapSuggestions.length === 0 && (
                                                <p className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                    Plugin required to optimize
                                                </p>
                                            )}
                                            {sitemapSuggestions.length > 0 && (
                                                <button
                                                    onClick={handleOptimizeSitemap}
                                                    disabled={sitemapLoading || !pluginConnected}
                                                    className="text-xs text-gray-500 hover:text-gray-700 underline mt-1 disabled:opacity-50 disabled:no-underline"
                                                >
                                                    {sitemapLoading ? "Re-optimizing..." : "Re-optimize Sitemap"}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Preview Stats / Current Stats */}
                                    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${sitemapSuggestions.length === 0 ? 'opacity-80' : ''}`}>
                                        <div className={`rounded-xl p-4 border relative overflow-hidden group ${sitemapSuggestions.length > 0 ? 'bg-indigo-50/50 border-indigo-100' : 'bg-gray-50 border-gray-100'}`}>
                                            {sitemapSuggestions.length > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-indigo-500 to-blue-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>}
                                            <p className={`text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5 ${sitemapSuggestions.length > 0 ? 'text-indigo-800' : 'text-gray-500'}`}>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                {sitemapSuggestions.length > 0 ? "Clean URLs Published" : "Potential Clean URLs"}
                                            </p>
                                            <div className="flex items-end gap-2">
                                                <span className={`text-2xl font-bold ${sitemapSuggestions.length > 0 ? 'text-indigo-900' : 'text-gray-700'}`}>
                                                    {sitemapSuggestions.length > 0 ? sitemapSuggestions[0].total_urls : `~${Math.max(0, stats.totalPages - stats.total404s - stats.noindexCount)}`}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="bg-rose-50/50 rounded-xl p-4 border border-rose-100 relative overflow-hidden group">
                                            {sitemapSuggestions.length > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-rose-500 to-red-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>}
                                            <p className="text-xs font-semibold text-rose-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                {sitemapSuggestions.length > 0 ? "404s Removed" : "To Remove: 404s"}
                                            </p>
                                            <div className="flex items-end gap-2">
                                                <span className="text-2xl font-bold text-rose-900">{stats.total404s}</span>
                                            </div>
                                        </div>

                                        <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100 relative overflow-hidden group">
                                            {sitemapSuggestions.length > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>}
                                            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                                {sitemapSuggestions.length > 0 ? "NoIndex Removed" : "To Remove: NoIndex"}
                                            </p>
                                            <div className="flex items-end gap-2">
                                                <span className="text-2xl font-bold text-amber-900">{stats.noindexCount}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Success Banner if Optimized */}
                                    {sitemapSuggestions.length > 0 && (
                                        <div className="mt-6 pt-5 border-t border-gray-100 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/50">
                                            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Your sitemap is currently optimized and live. Last updated: {new Date(sitemapSuggestions[0].created_at).toLocaleDateString()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Delete Site</h3>
                                <p className="text-sm text-gray-500">This action cannot be undone</p>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="mb-6">
                            <p className="text-gray-700">
                                Are you sure you want to delete <span className="font-semibold text-gray-900">{siteInfo?.displayUrl}</span>? This will permanently remove the site and all associated 404 error data.
                            </p>
                        </div>

                        {/* Error Message */}
                        {deleteError && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                                <p className="text-sm text-red-700 flex items-center gap-2">
                                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {deleteError}
                                </p>
                            </div>
                        )}

                        {/* Modal Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setDeleteError(null);
                                }}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteSite}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-3 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl transition-all shadow-lg shadow-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete Site
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Plugin Setup Modal */}
            {showPluginModal && siteInfo && (
                <PluginSetupModal
                    siteUrl={siteInfo.url}
                    apiKey={siteInfo.apiKey || "API key not found"}
                    onCheckConnection={handleCheckConnection}
                    onClose={() => setShowPluginModal(false)}
                />
            )}
        </div>
    );
}
