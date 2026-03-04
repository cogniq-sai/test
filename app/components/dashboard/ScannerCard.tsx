"use client";

import { useState, useEffect, useRef } from "react";
import { startScan, getScanStatus, ScanError, cancelScan, pauseScan, resumeScan } from "../../lib/api";

export interface ScanResult {
    id: string;
    type: "internal" | "external" | "plain";
    sourceUrl: string;
    brokenUrl: string;
    anchorText: string;
    statusCode: number;
}

interface ScannerCardProps {
    siteId: string;
    siteUrl: string;
    token: string;
    initialScanId?: string | null;
    onScanComplete?: (results: ScanError[]) => void;
}

type ScanStatus = "idle" | "scanning" | "complete" | "error" | "paused";

export default function ScannerCard({ siteId, siteUrl, token, initialScanId, onScanComplete }: ScannerCardProps) {
    const [status, setStatus] = useState<ScanStatus>("idle");
    const [progress, setProgress] = useState(0);
    const [pagesCrawled, setPagesCrawled] = useState(0);
    const [errorsFound, setErrorsFound] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [scanId, setScanId] = useState<string | null>(null);
    const [isPauseResumeLoading, setIsPauseResumeLoading] = useState(false);
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);

    // Sync with initialScanId if provided (e.g. auto-scan from dashboard)
    useEffect(() => {
        if (initialScanId && status === "idle") {
            setScanId(initialScanId);
            setStatus("scanning");
            pollingInterval.current = setInterval(() => {
                pollStatus(initialScanId);
            }, 3000);

            // Do an immediate poll to get current progress
            pollStatus(initialScanId);
        }
    }, [initialScanId, status]);

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
            }
        };
    }, []);

    const pollStatus = async (currentScanId: string) => {
        try {
            const response = await getScanStatus(token, currentScanId);
            setProgress(response.progress);
            setPagesCrawled(response.pages_crawled);
            setErrorsFound(response.errors_found);

            if (response.state === "completed") {
                if (pollingInterval.current) {
                    clearInterval(pollingInterval.current);
                }
                setStatus("complete");
                if (onScanComplete) {
                    // SiteDashboardPage will fetch the actual errors using getScanErrors
                    onScanComplete([]);
                }
            } else if (response.state === "failed") {
                if (pollingInterval.current) {
                    clearInterval(pollingInterval.current);
                }
                setStatus("error");
                setError(response.error_message || "Scan failed on server");
            } else if (response.state === "cancelled") {
                if (pollingInterval.current) {
                    clearInterval(pollingInterval.current);
                }
                setStatus("idle");
                setProgress(0);
                setScanId(null);
            } else if (response.state === "paused") {
                setStatus("paused");
            } else if (response.state === "running" || response.state === "queued") {
                setStatus("scanning");
            }
        } catch (err) {
            console.error("Polling error:", err);
            // Don't stop polling on single error, but maybe after X retries
        }
    };

    const handleStartScan = async () => {
        setStatus("scanning");
        setProgress(0);
        setPagesCrawled(0);
        setErrorsFound(0);
        setError(null);

        try {
            const response = await startScan(token, {
                site_id: siteId,
                url: siteUrl
            });

            if (response.status === "started" && response.scan_id) {
                setScanId(response.scan_id);
                // Start polling
                pollingInterval.current = setInterval(() => {
                    pollStatus(response.scan_id);
                }, 3000);
            } else {
                throw new Error(response.message || "Failed to start scan");
            }

        } catch (err) {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Scan failed");
        }
    };

    const handleStopScan = async () => {
        if (!scanId || !token) return;

        if (confirm("Are you sure you want to stop the current scan? This cannot be undone.")) {
            try {
                await cancelScan(token, scanId);
                // Status update will happen via polling or we can force it
                if (pollingInterval.current) {
                    clearInterval(pollingInterval.current);
                }
                setStatus("idle");
                setProgress(0);
                setScanId(null);
            } catch (err) {
                console.error("Failed to stop scan:", err);
                alert("Failed to stop scan");
            }
        }
    };

    const handlePauseScan = async () => {
        if (!scanId || !token) return;
        setIsPauseResumeLoading(true);
        try {
            await pauseScan(token, scanId);

            // Stop polling immediately
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
                pollingInterval.current = null;
            }
            setStatus("paused");
        } catch (err) {
            console.error("Failed to pause scan:", err);
            alert("Failed to pause scan");
        } finally {
            setIsPauseResumeLoading(false);
        }
    };

    const handleResumeScan = async () => {
        if (!scanId || !token) return;
        setIsPauseResumeLoading(true);
        try {
            await resumeScan(token, scanId);

            // Restart polling
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
            }
            setStatus("scanning");
            pollingInterval.current = setInterval(() => {
                pollStatus(scanId);
            }, 3000);
        } catch (err) {
            console.error("Failed to resume scan:", err);
            alert("Failed to resume scan");
        } finally {
            setIsPauseResumeLoading(false);
        }
    };

    const handleRescan = () => {
        setStatus("idle");
        setProgress(0);
        setPagesCrawled(0);
        setErrorsFound(0);
    };

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Site Audit Scanner</h3>
                    <p className="text-sm text-gray-500">Find broken links and SEO issues</p>
                </div>
            </div>

            {/* Status-specific content */}
            {status === "idle" && (
                <div className="text-center py-6">
                    <p className="text-gray-600 mb-6">
                        Crawl your site to discover broken links, missing pages, and redirect opportunities.
                    </p>
                    <button
                        onClick={handleStartScan}
                        className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-semibold text-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Start Site Audit
                    </button>
                </div>
            )}

            {(status === "scanning" || status === "paused") && (
                <div className="py-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-700">
                                {status === "paused" ? "Scan paused" : "Scanning pages..."}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                {pagesCrawled} crawled
                            </span>
                            {errorsFound > 0 && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                                    {errorsFound} found
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-blue-600">{Math.round(progress)}%</span>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={status === 'paused' ? handleResumeScan : handlePauseScan}
                                    disabled={isPauseResumeLoading}
                                    className={`p-1.5 rounded-lg transition-all ${status === 'paused'
                                        ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                                        : 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                                        }`}
                                    title={status === 'paused' ? "Resume Scan" : "Pause Scan"}
                                >
                                    {isPauseResumeLoading ? (
                                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : status === 'paused' ? (
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                        </svg>
                                    )}
                                </button>

                                <button
                                    onClick={handleStopScan}
                                    className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-all"
                                    title="Stop Scan"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 6h12v12H6z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    <p className="text-xs text-gray-500 text-center">
                        Analyzed <strong>{pagesCrawled}</strong> internal and external links.
                    </p>
                </div>
            )}

            {status === "complete" && (
                <div className="py-6 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <p className="text-gray-600 mb-4">Scan complete! Check the results below.</p>
                    <button
                        onClick={handleRescan}
                        className="px-6 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                    >
                        Run Another Scan
                    </button>
                </div>
            )}

            {status === "error" && (
                <div className="py-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <p className="text-red-600 mb-4">{error || "Something went wrong"}</p>
                    <button
                        onClick={handleRescan}
                        className="px-6 py-2 bg-red-100 text-red-700 rounded-xl font-medium hover:bg-red-200 transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            )}
        </div>
    );
}
