"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../context/AuthContext";
import { useDashboard } from "../../../context/DashboardContext";
import RedirectTable from "../../../components/dashboard/RedirectTable";
import { getSites, deleteSite, removeStoredSite, getScanErrors, getAllPages } from "../../../lib/api";
import ScannerCard from "../../../components/dashboard/ScannerCard";

interface SiteInfo {
    id: string;
    url: string;        // Original full URL for API calls
    displayUrl: string; // Clean URL for UI display
    status: "connected" | "pending" | "disconnected";
}

interface RedirectData {
    id: string;
    sourceUrl: string;
    suggestedTarget: string;
    confidence: number;
    aiReasoning: string;
    status: "pending" | "approved" | "rejected";
    detectedAt: string;
    errorType: "internal" | "external" | "standard";
    statusCode: number;
}

interface CrawledPage {
    url: string;
    title?: string;
    statusCode: number;
    crawledAt?: string;
}

type ScanState = "idle" | "scanning" | "completed";

export default function SiteDashboardPage() {
    const router = useRouter();
    const params = useParams();
    const { user, token, isAuthenticated, isLoading } = useAuth();
    const { refreshData } = useDashboard();
    const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
    const [scanState, setScanState] = useState<ScanState>("idle");
    const [scanProgress, setScanProgress] = useState(0);
    const [pages, setPages] = useState<CrawledPage[]>([]);
    const [redirects, setRedirects] = useState<RedirectData[]>([]);
    const [isPagesExpanded, setIsPagesExpanded] = useState(false);
    const [isRedirectsExpanded, setIsRedirectsExpanded] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isCheckingData, setIsCheckingData] = useState(true); // Loading state for initial data check

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const siteId = params.id as string;

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push("/login");
        }
    }, [isLoading, isAuthenticated, router]);

    // Fetch site info from API
    useEffect(() => {
        const fetchSiteInfo = async () => {
            if (user?.id && siteId) {
                try {
                    const response = await getSites(user.id);
                    const site = response.sites.find(s => s.id === siteId);
                    if (site) {
                        setSiteInfo({
                            id: site.id,
                            url: site.url, // Original full URL
                            displayUrl: site.url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
                            status: site.status || "pending"
                        });
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

    // Always try to fetch existing scan data when page loads
    useEffect(() => {
        const checkExistingScanData = async () => {
            if (!siteId || !token) {
                setIsCheckingData(false);
                return;
            }

            try {
                // Try to fetch existing pages and errors
                const [pagesResponse, errorsResponse] = await Promise.all([
                    getAllPages(siteId),
                    getScanErrors(token, siteId)
                ]);

                const hasPages = pagesResponse.success && pagesResponse.pages && pagesResponse.pages.length > 0;
                const hasErrors = errorsResponse.success && errorsResponse.errors && errorsResponse.errors.length > 0;

                // Only show completed state if there's actual data from a previous scan
                if (hasPages || hasErrors) {
                    // Site has been scanned before, show completed state
                    setScanState("completed");

                    if (hasPages) {
                        const mappedPages: CrawledPage[] = pagesResponse.pages.map((p: any) => ({
                            url: p.url,
                            title: p.title,
                            statusCode: p.statusCode || 200,
                            crawledAt: p.crawledAt || p.crawled_at || p.created_at || p.last_updated
                        }));
                        setPages(mappedPages);
                    }

                    if (hasErrors) {
                        const mappedResults: RedirectData[] = errorsResponse.errors.map(err => ({
                            id: err.id,
                            sourceUrl: err.broken_url,
                            suggestedTarget: "",
                            confidence: 0,
                            aiReasoning: `Found on page: ${err.source_url}`,
                            status: "pending",
                            detectedAt: err.created_at,
                            errorType: err.error_type as any,
                            statusCode: err.status_code
                        }));
                        setRedirects(mappedResults);
                    }
                }
                // If no data exists, stay in idle state (show "Start Scan" button)
            } catch (error) {
                console.error("Failed to check existing scan data:", error);
                // If fetch fails, stay in idle state
            } finally {
                setIsCheckingData(false);
            }
        };

        if (isAuthenticated && siteId && token) {
            checkExistingScanData();
        } else {
            setIsCheckingData(false);
        }
    }, [siteId, token, isAuthenticated]);

    const fetchDiscoveredPages = async () => {
        if (!siteId) return;
        try {
            const response = await getAllPages(siteId);
            if (response.success) {
                // 1. Process All Crawled Pages
                const mappedPages: CrawledPage[] = response.pages.map((p: any) => ({
                    url: p.url,
                    title: p.title,
                    statusCode: p.statusCode || p.status_code || 200,
                    crawledAt: p.crawledAt || p.crawled_at || p.created_at || p.last_updated
                }));
                setPages(mappedPages);

                // 2. Filter 404s for Broken Link Review
                const brokenPages = response.pages.filter((p: any) =>
                    p.status_code === 404 ||
                    p.status === 'broken' ||
                    (p.statusCode === 404)
                );

                if (brokenPages.length > 0) {
                    const mappedRedirects: RedirectData[] = brokenPages.map((p: any, index: number) => ({
                        id: p.id || `broken-${index}`,
                        sourceUrl: p.url,
                        suggestedTarget: "",
                        confidence: 0,
                        aiReasoning: "Detected as 404 Not Found",
                        status: "pending",
                        detectedAt: p.last_updated || new Date().toISOString(),
                        errorType: "external", // Defaulting to external for now as we don't have this detail
                        statusCode: 404
                    }));
                    setRedirects(mappedRedirects);
                }
            }
        } catch (error) {
            console.error("Failed to fetch discovered pages:", error);
        }
    };

    const fetchScanResults = async () => {
        if (!token || !siteId) return;
        try {
            const response = await getScanErrors(token, siteId);
            if (response.success) {
                // Map API results to the RedirectData structure
                const mappedResults: RedirectData[] = response.errors.map(err => ({
                    id: err.id,
                    sourceUrl: err.broken_url, // broken_url is the actual 404 URL
                    suggestedTarget: "",
                    confidence: 0,
                    aiReasoning: `Found on page: ${err.source_url}`,
                    status: "pending",
                    detectedAt: err.created_at,
                    errorType: err.error_type as any,
                    statusCode: err.status_code
                }));
                setRedirects(mappedResults);
            }
        } catch (error) {
            console.error("Failed to fetch scan results:", error);
        }
    };

    useEffect(() => {
        if (scanState === "completed") {
            fetchScanResults();
            fetchDiscoveredPages();
        }
    }, [scanState]);

    const handleScanComplete = () => {
        setScanState("completed");
        fetchScanResults();
        fetchDiscoveredPages();
        refreshData(); // Sync with dashboard cache
    };

    const handleStartScan = () => {
        setScanState("scanning");
        setScanProgress(0);
        setPages([]); // Clear old results
        setRedirects([]);
        refreshData(); // Sync with dashboard cache ("in_progress")
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

    const handleApprove = (id: string) => {
        setRedirects(prev => prev.map(r => r.id === id ? { ...r, status: "approved" as const } : r));
    };

    const handleReject = (id: string) => {
        setRedirects(prev => prev.map(r => r.id === id ? { ...r, status: "rejected" as const } : r));
    };

    const handleEdit = (id: string, newTarget: string) => {
        setRedirects(prev => prev.map(r => r.id === id ? { ...r, suggestedTarget: newTarget } : r));
    };

    // Calculate stats
    const stats = {
        totalPages: pages.length,
        total404s: redirects.length,
        pendingReviews: redirects.filter(r => r.status === "pending").length,
        approved: redirects.filter(r => r.status === "approved").length,
        rejected: redirects.filter(r => r.status === "rejected").length
    };

    if (isLoading || isCheckingData) {
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
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold text-gray-900">
                            SEOFlow <span className="text-blue-600">AI</span>
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
                                    <span className="text-sm text-gray-500">
                                        AI-powered 404 detection and redirect suggestions
                                    </span>
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

                        {/* ===== ACCORDION 1: Broken Link Review ===== */}
                        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/50 border border-white/60 overflow-hidden mb-6">
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
                                                {redirects.length > 0 && (
                                                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 bg-orange-100 text-orange-700 text-sm font-medium rounded-md">
                                                        {stats.pendingReviews}
                                                    </span>
                                                )}
                                            </div>
                                            {!isRedirectsExpanded && (
                                                <p className="text-sm text-gray-500 mt-0.5">
                                                    View and manage broken link issues
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors">
                                        <svg
                                            className={`w-5 h-5 transition-transform duration-300 ${isRedirectsExpanded ? 'rotate-180' : ''}`}
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
                                className={`transition-all duration-300 ease-in-out overflow-hidden ${isRedirectsExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                            >
                                <div className="border-t border-gray-100 p-6">
                                    {redirects.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-2">No broken links detected</h3>
                                            <p className="text-gray-600 text-center max-w-md">
                                                No 404 errors or redirect suggestions have been detected for this site yet.
                                            </p>
                                        </div>
                                    ) : (
                                        <RedirectTable
                                            redirects={redirects}
                                            onApprove={handleApprove}
                                            onReject={handleReject}
                                            onEdit={handleEdit}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ===== ACCORDION 2: Crawled Pages ===== */}
                        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/50 border border-white/60 overflow-hidden">
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
                    </>
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
        </div>
    );
}
