"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import Link from "next/link";
import { deleteSite, removeStoredSite, addSite, startScan, Site } from "../lib/api";
import EmptyDashboardState from "../components/dashboard/EmptyDashboardState";
import AddSiteModal from "../components/dashboard/AddSiteModal";
import SiteCard from "../components/dashboard/SiteCard";
import SearchFilter from "../components/dashboard/SearchFilter";
import ActivityFeed, { Activity } from "../components/dashboard/ActivityFeed";

export default function DashboardPage() {
    const { user, token, isAuthenticated, isLoading, isInitializing, logout } = useAuth();
    const { sites, stats, activities, isLoading: isDashboardLoading, refreshData } = useDashboard();
    const router = useRouter();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [pendingScanProcessed, setPendingScanProcessed] = useState(false);
    const [isProcessingPendingScan, setIsProcessingPendingScan] = useState(false);

    // Initial mount check to prevent hydration mismatch
    useEffect(() => {
        setHasMounted(true);
    }, []);

    // Auto-add site + auto-start scan from pending_scan_url (set by landing page ScanModal)
    useEffect(() => {
        if (pendingScanProcessed || !isAuthenticated || !token || !user?.id) return;

        const pendingUrl = localStorage.getItem("pending_scan_url");
        if (!pendingUrl) return;

        setPendingScanProcessed(true);
        setIsProcessingPendingScan(true);
        // Clear immediately to prevent re-triggering
        localStorage.removeItem("pending_scan_url");

        const autoAddAndScan = async () => {
            try {
                // 1. Register the site
                const siteResponse = await addSite(token, pendingUrl, user.id);

                // 2. Start scan immediately
                try {
                    await startScan(token, {
                        site_id: siteResponse.site_id,
                        url: pendingUrl,
                    });
                } catch (scanErr) {
                    console.warn("Auto-scan failed (site was still added):", scanErr);
                }

                // 3. Navigate to the site detail page
                router.push(`/dashboard/site/${siteResponse.site_id}`);
            } catch (err) {
                console.error("Auto-add site failed:", err);
                setIsProcessingPendingScan(false);
                // Fallback: just stay on dashboard, user can add manually
                refreshData();
            }
        };

        autoAddAndScan();
    }, [isAuthenticated, token, user?.id, pendingScanProcessed, router, refreshData]);

    // Search, Filter, and Sort state
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'scanned' | 'never-scanned'>('all');
    const [sortType, setSortType] = useState<'last-scanned' | 'alphabetical'>('last-scanned');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Greeting — computed client-side only to avoid hydration mismatch
    const [greeting, setGreeting] = useState("Welcome back! 👋");
    useEffect(() => {
        if (!user?.name) return;
        const hour = new Date().getHours();
        const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        const firstName = user.name.split(' ')[0];
        setGreeting(`${timeGreeting}, ${firstName}! 👋`);
    }, [user?.name]);

    // Manual refresh handler
    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        try {
            await refreshData();
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        if (!isInitializing && !isLoading && !isAuthenticated) {
            router.push("/login");
        }
    }, [isInitializing, isLoading, isAuthenticated, router]);

    // Refresh dashboard data when page comes into focus from navigation
    useEffect(() => {
        const handleVisibilityChange = () => {
            // Only refresh if page is becoming visible
            if (!document.hidden && isDashboardLoading === false) {
                // Data is already loaded, no need to refresh on visibility change
                // The context will handle cache management
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isDashboardLoading]);

    // Callback to refresh sites after adding a new one
    const handleSiteAdded = (siteUrl?: string) => {
        refreshData();
    };

    // Handle site deletion from quick actions menu
    const handleDeleteSite = async (siteId: string) => {
        if (!token || !user?.id) return;

        // Find the site before deletion to get its URL for the activity feed
        const siteToDelete = sites.find(s => s.id === siteId);

        if (confirm('Are you sure you want to delete this site? This action cannot be undone.')) {
            try {
                await deleteSite(token, siteId);
                removeStoredSite(user.id, siteId);
                // Refresh the sites list from context
                refreshData();
            } catch (error) {
                console.error('Failed to delete site:', error);
                alert('Failed to delete site. Please try again.');
            }
        }
    };

    // Filter and sort sites
    const filteredAndSortedSites = useMemo(() => {
        let filtered = sites;

        // Apply search filter
        if (searchQuery) {
            filtered = filtered.filter(site =>
                site.url.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Apply status filter
        if (filterType === 'scanned') {
            filtered = filtered.filter(site => site.status === 'connected');
        } else if (filterType === 'never-scanned') {
            filtered = filtered.filter(site => site.status !== 'connected');
        }

        // Apply sorting
        const sorted = [...filtered].sort((a, b) => {
            if (sortType === 'alphabetical') {
                return a.url.localeCompare(b.url);
            } else {
                // Sort by last activity (newest first)
                const dateA = new Date(a.lastActivity || 0).getTime();
                const dateB = new Date(b.lastActivity || 0).getTime();
                return dateB - dateA;
            }
        });

        return sorted;
    }, [sites, searchQuery, filterType, sortType]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterType, sortType]);

    // Calculate pagination
    const totalPages = Math.ceil(filteredAndSortedSites.length / itemsPerPage);
    const paginatedSites = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredAndSortedSites.slice(startIndex, endIndex);
    }, [filteredAndSortedSites, currentPage, itemsPerPage]);

    if (!hasMounted || isInitializing || isLoading || isProcessingPendingScan) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">
                <div className="flex flex-col items-center gap-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/25 animate-pulse">
                        <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Setting up your site...</h3>
                        <p className="text-gray-500 font-medium">We are adding your website and starting the AI scan.</p>
                    </div>
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
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">{user?.email}</span>
                        <button
                            onClick={logout}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Dashboard Header */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            {greeting}
                        </h1>
                        <p className="text-gray-600 mt-1">Here's an overview of your SEO performance</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleManualRefresh}
                            disabled={isRefreshing || isDashboardLoading}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Refresh dashboard data"
                        >
                            <svg className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.009 8.009 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {isRefreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 font-medium"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Site
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {/* Total Sites Connected */}
                    <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50 hover:shadow-xl transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Total Sites Connected</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalSites}</p>
                            </div>
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Total 404s Detected */}
                    <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50 hover:shadow-xl transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Total 404s Detected</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total404s}</p>
                            </div>
                            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-400 rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Total Pages Crawled */}
                    <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50 hover:shadow-xl transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Total Pages Crawled</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalPages}</p>
                            </div>
                            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-400 rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Scan Coverage */}
                    <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50 hover:shadow-xl transition-shadow">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Scan Coverage</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.scanCoverage}%</p>
                            </div>
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-400 rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sites Section - Conditional Rendering */}
                {isDashboardLoading ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            {/* Skeleton Filter Bar */}
                            <div className="h-14 bg-white/50 backdrop-blur-sm rounded-xl animate-pulse" />

                            {/* Skeleton Cards */}
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/50 p-6 shadow-sm">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-14 h-14 bg-gray-200 rounded-2xl animate-pulse" />
                                            <div>
                                                <div className="h-5 w-40 bg-gray-200 rounded animate-pulse mb-2" />
                                                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-gray-200 w-1/3 animate-pulse" />
                                    </div>
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                                        <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="lg:col-span-1">
                            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/50 p-6 h-96 animate-pulse" />
                        </div>
                    </div>
                ) : sites.length === 0 ? (
                    <EmptyDashboardState onAddSite={() => setIsModalOpen(true)} />
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main content - Sites List */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Search and Filter Controls */}
                            <SearchFilter
                                searchQuery={searchQuery}
                                onSearchChange={setSearchQuery}
                                filterType={filterType}
                                onFilterChange={setFilterType}
                                sortType={sortType}
                                onSortChange={setSortType}
                                totalCount={sites.length}
                                filteredCount={filteredAndSortedSites.length}
                            />

                            {/* Sites Grid */}
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-gray-900">Connected Sites</h2>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-gray-500">
                                        {filteredAndSortedSites.length} site{filteredAndSortedSites.length !== 1 ? 's' : ''}
                                    </span>
                                    {/* Debug info */}
                                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                </div>
                            </div>

                            {filteredAndSortedSites.length === 0 ? (
                                <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No sites found</h3>
                                    <p className="text-gray-600">
                                        {searchQuery ? `No sites matching "${searchQuery}"` : 'No sites match your current filters'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 gap-6">
                                        {paginatedSites.map((site) => (
                                            <SiteCard key={site.id} site={site} onDelete={handleDeleteSite} />
                                        ))}
                                    </div>

                                    {/* Pagination Controls */}
                                    {totalPages > 1 && (
                                        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
                                            <div className="text-sm text-gray-600">
                                                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedSites.length)} of {filteredAndSortedSites.length} sites
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* Previous Button */}
                                                <button
                                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                    disabled={currentPage === 1}
                                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${currentPage === 1
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                        : 'bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-600 border border-gray-300'
                                                        }`}
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                    </svg>
                                                </button>

                                                {/* Page Numbers */}
                                                <div className="flex items-center gap-1">
                                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                                                        // Show first page, last page, current page, and pages around current
                                                        const showPage = pageNum === 1 ||
                                                            pageNum === totalPages ||
                                                            (pageNum >= currentPage - 1 && pageNum <= currentPage + 1);

                                                        // Show ellipsis
                                                        const showEllipsisBefore = pageNum === currentPage - 2 && currentPage > 3;
                                                        const showEllipsisAfter = pageNum === currentPage + 2 && currentPage < totalPages - 2;

                                                        if (showEllipsisBefore || showEllipsisAfter) {
                                                            return <span key={pageNum} className="px-2 text-gray-400">...</span>;
                                                        }

                                                        if (!showPage) return null;

                                                        return (
                                                            <button
                                                                key={pageNum}
                                                                onClick={() => setCurrentPage(pageNum)}
                                                                className={`w-10 h-10 rounded-lg font-medium transition-colors ${currentPage === pageNum
                                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                                                    : 'bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-600 border border-gray-300'
                                                                    }`}
                                                            >
                                                                {pageNum}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {/* Next Button */}
                                                <button
                                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                    disabled={currentPage === totalPages}
                                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${currentPage === totalPages
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                        : 'bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-600 border border-gray-300'
                                                        }`}
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Sidebar - Activity Feed (Sticky) */}
                        <div className="lg:col-span-1">
                            <div className="sticky top-24">
                                <ActivityFeed activities={activities} />
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Add Site Modal */}
            <AddSiteModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSiteAdded={handleSiteAdded}
                token={token || ""}
                userId={user?.id || ""}
            />
        </div>
    );
}
