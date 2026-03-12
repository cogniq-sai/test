"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Site } from "../../lib/api";
import { pauseScan, resumeScan, cancelScan } from "../../lib/api/scan";

interface SiteCardProps {
    site: Site;
    onDelete?: (siteId: string) => void;
    token?: string;
}

export default function SiteCard({ site, onDelete, token }: SiteCardProps) {
    const router = useRouter();

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isPauseResumeLoading, setIsPauseResumeLoading] = useState(false);
    const [isStopLoading, setIsStopLoading] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const displayUrl = site.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const isScanned = site.status === "connected";

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };

        if (isMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isMenuOpen]);

    const handleClick = () => {
        router.push(`/dashboard/site/${site.id}`);
    };

    const handleCopyUrl = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(site.url);
        setIsMenuOpen(false);
        // You can add a toast notification here
    };



    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        if (onDelete) {
            onDelete(site.id);
        }
    };

    const handleViewDetails = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        router.push(`/dashboard/site/${site.id}`);
    };

    const handlePauseScan = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!token || !site.activeScanId) return;

        setIsPauseResumeLoading(true);
        try {
            await pauseScan(token, site.activeScanId);
            // The parent component will refresh scan status via polling
        } catch (error) {
            console.error("Failed to pause scan:", error);
            alert("Failed to pause scan. Please try again.");
        } finally {
            setIsPauseResumeLoading(false);
        }
    };

    const handleResumeScan = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!token || !site.activeScanId) return;

        setIsPauseResumeLoading(true);
        try {
            await resumeScan(token, site.activeScanId);
            // The parent component will refresh scan status via polling
        } catch (error) {
            console.error("Failed to resume scan:", error);
            alert("Failed to resume scan. Please try again.");
        } finally {
            setIsPauseResumeLoading(false);
        }
    };

    const handleStopScan = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!token || !site.activeScanId) return;

        if (!confirm("Are you sure you want to stop this scan? This cannot be undone.")) {
            return;
        }

        setIsStopLoading(true);
        try {
            await cancelScan(token, site.activeScanId);
        } catch (error) {
            console.error("Failed to stop scan:", error);
            alert("Failed to stop scan. Please try again.");
        } finally {
            setIsStopLoading(false);
        }
    };

    // Format relative time
    const getRelativeTime = (site: Site) => {
        // If scan is completed, show completion time
        if (site.scanState === 'completed' && site.completedAt) {
            const date = new Date(site.completedAt);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return "Completed just now";
            if (diffMins < 60) return `Completed ${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
            if (diffHours < 24) return `Completed ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            if (diffDays < 7) return `Completed ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            if (diffDays < 30) return `Completed ${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
            return `Completed ${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
        }

        // If scan is in progress
        if (site.scanState === 'in_progress') {
            return "Scanning in progress...";
        }

        // If scan is paused
        if (site.scanState === 'paused') {
            return "Scan paused";
        }

        // If scan failed
        if (site.scanState === 'failed') {
            return "Scan failed";
        }

        // If not scanned yet
        if (!isScanned) {
            return "Awaiting scan";
        }

        // Fallback to last activity
        if (site.lastActivity) {
            const date = new Date(site.lastActivity);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return "Just now";
            if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
            return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
        }

        return "Recently";
    };

    return (
        <div
            onClick={handleClick}
            className="group bg-white rounded-2xl border-2 border-gray-200 p-6 cursor-pointer 
                       hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200 relative"
        >
            {/* Content container */}
            <div>
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                        {/* Icon */}
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center">
                            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                        </div>

                        {/* Progress Indicator */}
                        <div className="relative flex items-center justify-center">
                            {/* Calculate progress: 0% = not scanned, 100% = scanned */}
                            {(() => {
                                const progress = site.scanState === 'completed'
                                    ? 100
                                    : site.scanProgress !== undefined
                                        ? site.scanProgress
                                        : (isScanned ? 100 : 0);
                                const radius = 16;
                                const circumference = 2 * Math.PI * radius;
                                const offset = circumference - (progress / 100) * circumference;

                                return (
                                    <div className="relative w-10 h-10">
                                        <svg className="transform -rotate-90 w-10 h-10">
                                            {/* Background circle */}
                                            <circle
                                                cx="20"
                                                cy="20"
                                                r={radius}
                                                stroke="currentColor"
                                                strokeWidth="3"
                                                fill="none"
                                                className="text-gray-200"
                                            />
                                            {/* Progress circle */}
                                            <circle
                                                cx="20"
                                                cy="20"
                                                r={radius}
                                                stroke="currentColor"
                                                strokeWidth="3"
                                                fill="none"
                                                strokeDasharray={circumference}
                                                strokeDashoffset={offset}
                                                className={`transition-all duration-500 ${progress === 0 ? 'text-gray-300' :
                                                    progress === 100 ? 'text-emerald-500' :
                                                        'text-blue-500'
                                                    }`}
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        {/* Center content */}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            {progress === 100 ? (
                                                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[10px] font-semibold text-gray-400">{progress}%</span>
                                                    {progress >= 95 && (
                                                        <span className="text-[6px] font-bold text-blue-500 animate-pulse whitespace-nowrap">FINISHING...</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Pause/Resume and Stop Buttons */}
                        {token && site.activeScanId && (site.scanState === 'in_progress' || site.scanState === 'paused') && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={site.scanState === 'paused' ? handleResumeScan : handlePauseScan}
                                    disabled={isPauseResumeLoading || isStopLoading}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${site.scanState === 'paused'
                                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    title={site.scanState === 'paused' ? 'Resume scan' : 'Pause scan'}
                                >
                                    {isPauseResumeLoading ? (
                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : site.scanState === 'paused' ? (
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                        </svg>
                                    )}
                                    <span>{isPauseResumeLoading ? '' : site.scanState === 'paused' ? 'Resume' : 'Pause'}</span>
                                </button>

                                <button
                                    onClick={handleStopScan}
                                    disabled={isStopLoading || isPauseResumeLoading}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Stop scan"
                                >
                                    {isStopLoading ? (
                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 6h12v12H6z" />
                                        </svg>
                                    )}
                                    <span>{isStopLoading ? '' : 'Stop'}</span>
                                </button>
                            </div>
                        )}

                        {/* Status Badge */}
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full ${site.scanState === 'completed'
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                            : site.scanState === 'in_progress'
                                ? "bg-blue-50 text-blue-600 border border-blue-200"
                                : site.scanState === 'paused'
                                    ? "bg-amber-50 text-amber-600 border border-amber-200"
                                    : site.scanState === 'failed'
                                        ? "bg-red-50 text-red-600 border border-red-200"
                                        : isScanned
                                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                            : "bg-gray-50 text-gray-600 border border-gray-200"
                            }`}>
                            <span className={`w-2 h-2 rounded-full ${site.scanState === 'completed'
                                ? "bg-emerald-500"
                                : site.scanState === 'in_progress'
                                    ? "bg-blue-500 animate-pulse"
                                    : site.scanState === 'paused'
                                        ? "bg-amber-500"
                                        : site.scanState === 'failed'
                                            ? "bg-red-500"
                                            : isScanned
                                                ? "bg-emerald-500"
                                                : "bg-gray-400"
                                }`} />
                            {site.scanState === 'completed'
                                ? `Scanned (${site.pagesCrawled || site.totalPages || 0} pages)`
                                : site.scanState === 'in_progress'
                                    ? "Scanning..."
                                    : site.scanState === 'paused'
                                        ? "Paused"
                                        : site.scanState === 'failed'
                                            ? "Failed"
                                            : isScanned
                                                ? "Scanned"
                                                : "Ready to scan"
                            }
                        </span>

                        {/* Quick Actions Menu */}
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMenuOpen(!isMenuOpen);
                                }}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                aria-label="More options"
                            >
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                            </button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <button
                                        onClick={handleViewDetails}
                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        View Details
                                    </button>
                                    <button
                                        onClick={handleCopyUrl}
                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Copy URL
                                    </button>

                                    <button
                                        onClick={handleDelete}
                                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete Site
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Site URL */}
                <h3 className="text-lg font-bold text-gray-900 mb-1 truncate">
                    {displayUrl}
                </h3>

                {/* Last Scan Info */}
                <div className="flex items-center gap-1.5 mb-3">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-gray-500">
                        {getRelativeTime(site)}
                    </p>
                </div>

                {/* Description with icon */}
                <div className="flex items-center gap-2">
                    {isScanned ? (
                        <>
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-sm text-gray-500 font-medium">
                                {site.totalPages || 0} pages
                            </p>
                            <span className="text-gray-300">•</span>
                            <div className="flex items-center gap-1">
                                <span className={`text-sm font-bold ${
                                    (site.healthScore || 0) > 80 ? 'text-emerald-500' : 
                                    (site.healthScore || 0) > 50 ? 'text-amber-500' : 'text-red-500'
                                }`}>
                                    {site.healthScore || 0}%
                                </span>
                                <span className="text-xs text-gray-400 font-medium">score</span>
                            </div>
                            {(site.totalErrors || 0) > 0 && (
                                <>
                                    <span className="text-gray-300">•</span>
                                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <p className="text-sm text-red-500 font-medium">
                                        {site.totalErrors} broken links
                                    </p>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <p className="text-sm text-blue-600 font-medium">
                                Ready to scan
                            </p>
                        </>
                    )}
                </div>

                {/* View details text - shown on hover */}
                <div className="flex justify-end mt-5">
                    <div className="flex items-center gap-1 text-gray-400 group-hover:text-blue-500 transition-colors">
                        <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            View details
                        </span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
}
