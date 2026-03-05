"use client";

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

const HeroSection = () => {
    const { isAuthenticated, isInitializing } = useAuth();
    const router = useRouter();

    // Inline Scan Form State
    const [siteUrl, setSiteUrl] = useState("");
    const [error, setError] = useState("");

    const validateUrl = (url: string): boolean => {
        try {
            const urlToTest = url.startsWith("http") ? url : `https://${url}`;
            new URL(urlToTest);
            return true;
        } catch {
            return false;
        }
    };

    const handleScanSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const trimmed = siteUrl.trim();
        if (!trimmed) {
            setError("Please enter your website URL");
            return;
        }

        if (!validateUrl(trimmed)) {
            setError("Please enter a valid URL (e.g. example.com)");
            return;
        }

        // Normalize URL
        const normalizedUrl = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

        // Save to localStorage so the dashboard can pick it up after auth
        localStorage.setItem("pending_scan_url", normalizedUrl);

        // Redirect to signup
        router.push("/login?mode=signup");
    };

    return (
        <section className="min-h-screen flex items-center relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">

            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl"></div>
                <div className="absolute top-1/2 -left-40 w-96 h-96 bg-cyan-400/20 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-purple-400/10 rounded-full blur-3xl"></div>
            </div>

            {/* Grid pattern overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:14px_24px]"></div>

            <div className="max-w-6xl mx-auto px-6 pt-24 relative z-10 w-full">
                <div className="w-full mx-auto text-center flex flex-col items-center">

                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-blue-100 rounded-full text-sm font-medium text-blue-700 mb-8 shadow-sm">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        AI-Powered AutoRankr
                    </div>

                    {/* Heading */}
                    <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
                        Fix Broken Links
                        <span className="block mt-2 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 bg-clip-text text-transparent">
                            Automatically with AI
                        </span>
                    </h1>

                    {/* Description */}
                    <p className="mt-6 text-xl text-gray-600 leading-relaxed w-full max-w-3xl mx-auto">
                        Detect 404 errors on your WordPress site, get AI-powered redirect
                        suggestions, and improve SEO performance — without slowing down
                        your website.
                    </p>

                    {/* Inline Scan Form / CTA */}
                    <div className="mt-10 w-full">
                        {!isInitializing && isAuthenticated ? (
                            <div className="flex flex-wrap items-center justify-center gap-4">
                                <Link
                                    href="/dashboard"
                                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    Go to Dashboard
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                    </svg>
                                </Link>
                                <button className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-gray-200 rounded-xl text-gray-700 font-semibold text-lg hover:bg-gray-50 transition-colors">
                                    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                    How It Works
                                </button>
                            </div>
                        ) : (
                            <div className="w-full max-w-3xl mx-auto">
                                <form onSubmit={handleScanSubmit} className="w-full flex flex-col sm:flex-row items-center gap-2 p-2 bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100 transition-all hover:shadow-2xl hover:shadow-blue-900/10 mb-4 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-400">
                                    <div className="relative flex-grow w-full">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                        </div>
                                        <input
                                            type="text"
                                            value={siteUrl}
                                            onChange={(e) => { setSiteUrl(e.target.value); setError(""); }}
                                            placeholder="Enter your website URL (e.g. example.com)"
                                            className="w-full h-full min-h-[52px] pl-14 pr-4 bg-transparent border-transparent focus:border-transparent focus:ring-0 focus:outline-none outline-none text-gray-900 text-lg placeholder:text-gray-400"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="h-[52px] w-full sm:w-auto px-10 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-[1.1rem] font-bold text-lg shadow-md hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex-shrink-0 flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        Start Free Scan
                                        <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </button>
                                </form>

                                {/* Bottom Row: Errors & Extra Links */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 gap-4">
                                    <div className="flex items-center gap-4">
                                        {error ? (
                                            <p className="text-sm font-medium text-red-600 flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                                                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                {error}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-gray-500 flex items-center gap-1.5 font-medium">
                                                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Free Scan. No credit card needed.
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-blue-600 transition-colors"
                                    >
                                        <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                                            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.024-.983a1.125 1.125 0 010 1.966l-5.603 3.113A1.125 1.125 0 019 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113z" clipRule="evenodd" />
                                        </svg>
                                        See how it works
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="mt-16 flex flex-wrap justify-center gap-8 md:gap-16">
                        <div>
                            <div className="text-4xl font-bold text-gray-900">99%</div>
                            <div className="text-sm text-gray-500 mt-1">Detection Accuracy</div>
                        </div>
                        <div>
                            <div className="text-4xl font-bold text-gray-900">24/7</div>
                            <div className="text-sm text-gray-500 mt-1">Live Monitoring</div>
                        </div>
                        <div>
                            <div className="text-4xl font-bold text-gray-900">5 sec</div>
                            <div className="text-sm text-gray-500 mt-1">Avg Response Time</div>
                        </div>
                    </div>

                </div>
            </div>

        </section>
    );
};

export default HeroSection;
