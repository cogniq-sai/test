"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../context/AuthContext";
import { getSiteReport } from "../../../../lib/api";
import Link from "next/link";

export default function SiteReportPage() {
    const params = useParams();
    const siteId = params.id as string;
    const { token, isAuthenticated, isLoading } = useAuth();
    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push("/login");
        }
    }, [isAuthenticated, isLoading, router]);

    useEffect(() => {
        const fetchReport = async () => {
            if (!token || !siteId) return;
            try {
                const data = await getSiteReport(token, siteId);
                setReport(data);
            } catch (err) {
                console.error("Failed to fetch report:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [token, siteId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium animate-pulse">Generating Professional Report...</p>
                </div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Report Not Found</h1>
                <p className="text-gray-500 mb-6">We couldn't generate the report for this site.</p>
                <Link href={`/dashboard/site/${siteId}`} className="text-blue-600 font-bold hover:underline">
                    Return to Dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 print:bg-white print:py-0 print:px-0">
            {/* Header / Actions */}
            <div className="max-w-4xl mx-auto mb-8 flex justify-between items-center print:hidden">
                <Link href={`/dashboard/site/${siteId}`} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    BACK TO DASHBOARD
                </Link>
                <button 
                    onClick={() => window.print()}
                    className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/25 hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    PRINT TO PDF
                </button>
            </div>

            {/* Main Report Document */}
            <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-3xl overflow-hidden print:shadow-none print:rounded-none">
                {/* Visual Header */}
                <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-12 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                </svg>
                            </div>
                            <span className="font-black text-2xl tracking-tighter italic">AutoRankr AI</span>
                        </div>
                        <h1 className="text-4xl font-black mb-2 leading-tight">Professional SEO Audit Report</h1>
                        <p className="text-blue-100 font-medium text-lg uppercase tracking-widest opacity-80">
                            Generated on {new Date(report.generated_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
                        </p>
                    </div>
                </div>

                <div className="p-12 space-y-12">
                    {/* Executive Summary */}
                    <section>
                        <h2 className="text-2xl font-black text-gray-900 mb-6 border-b-2 border-gray-100 pb-2">Executive Summary</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Health Score</p>
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-4xl font-black ${
                                        report.summary.score > 80 ? 'text-emerald-600' : 
                                        report.summary.score > 50 ? 'text-amber-600' : 'text-red-600'
                                    }`}>{report.summary.score}</span>
                                    <span className="text-gray-400 font-bold">/ 100</span>
                                </div>
                            </div>
                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 text-center">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                <span className={`text-2xl font-black uppercase tracking-tighter ${
                                    report.summary.status === 'HEALTHY' ? 'text-emerald-600' : 
                                    report.summary.status === 'WARNING' ? 'text-amber-600' : 'text-red-600'
                                }`}>{report.summary.status}</span>
                            </div>
                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Pages Audited</p>
                                <span className="text-3xl font-black text-gray-900">{report.summary.total_pages}</span>
                            </div>
                        </div>
                    </section>

                    {/* Critical Issues */}
                    <section>
                        <h2 className="text-2xl font-black text-gray-900 mb-6 border-b-2 border-gray-100 pb-2">Critical SEO Issues</h2>
                        {report.issues.critical.length > 0 ? (
                            <div className="space-y-4">
                                {report.issues.critical.map((url: string, i: number) => (
                                    <div key={i} className="flex items-start gap-4 bg-red-50/30 p-4 rounded-xl border border-red-100">
                                        <div className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">!</div>
                                        <div>
                                            <p className="font-bold text-gray-900 text-sm">Broken Technical Link Detected</p>
                                            <p className="text-xs text-red-600 font-mono mt-1 break-all">{url}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 text-emerald-700 font-bold text-center">
                                No critical broken links found. Exceptional technical health!
                            </div>
                        )}
                    </section>

                    {/* Content Gaps */}
                    <section>
                        <h2 className="text-2xl font-black text-gray-900 mb-6 border-b-2 border-gray-100 pb-2">Optimization Gaps</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Meta Titles</h3>
                                <p className="text-3xl font-black text-gray-900 mb-2">{report.issues.metadata.missing_titles.length}</p>
                                <p className="text-xs text-gray-500 leading-relaxed italic">Missing or empty title tags found across the sample set.</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Descriptions</h3>
                                <p className="text-3xl font-black text-gray-900 mb-2">{report.issues.metadata.missing_descriptions.length}</p>
                                <p className="text-xs text-gray-500 leading-relaxed italic">Pages missing descriptive meta tags for search results.</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">H1 Structure</h3>
                                <p className="text-3xl font-black text-gray-900 mb-2">{report.issues.metadata.missing_h1s.length}</p>
                                <p className="text-xs text-gray-500 leading-relaxed italic">Pages lacking a primary H1 heading for content hierarchy.</p>
                            </div>
                        </div>
                    </section>

                    {/* AI Recommendations */}
                    <section>
                        <div className="bg-blue-50 rounded-3xl p-8 border border-blue-100">
                            <h2 className="text-2xl font-black text-blue-900 mb-6 flex items-center gap-3">
                                <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z" />
                                </svg>
                                AI Action Roadmap
                            </h2>
                            <div className="space-y-4">
                                {report.recommendations.map((rec: string, i: number) => (
                                    <div key={i} className="flex gap-4 bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                                        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black flex-shrink-0">{i+1}</div>
                                        <p className="text-gray-900 font-medium leading-relaxed">{rec}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Footer / Disclaimer */}
                    <footer className="pt-12 border-t border-gray-100 text-center">
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Automated SEO Audit Powered by Gemini AI</p>
                        <p className="text-xs text-gray-300 max-w-lg mx-auto leading-relaxed">
                            This report is an automated assessment based on current crawling data. 
                            Regular audits and manual verification are recommended for optimal optimization.
                        </p>
                    </footer>
                </div>
            </div>
        </div>
    );
}
