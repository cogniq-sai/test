"use client";

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import Link from "next/link";
import ScanModal from "./ScanModal";

const HeroSection = () => {
    const { isAuthenticated, isInitializing } = useAuth();
    const [isScanModalOpen, setIsScanModalOpen] = useState(false);

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

            <div className="max-w-6xl mx-auto px-6 pt-24 relative z-10">
                <div className="max-w-3xl">

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
                    <p className="mt-6 text-xl text-gray-600 leading-relaxed max-w-2xl">
                        Detect 404 errors on your WordPress site, get AI-powered redirect
                        suggestions, and improve SEO performance — without slowing down
                        your website.
                    </p>

                    {/* CTA Buttons */}
                    <div className="mt-10 flex flex-wrap gap-4">
                        {!isInitializing && isAuthenticated ? (
                            <Link
                                href="/dashboard"
                                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Go to Dashboard
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                            </Link>
                        ) : (
                            <button
                                onClick={() => setIsScanModalOpen(true)}
                                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                Scan Your Site
                            </button>
                        )}

                        <button className="inline-flex items-center gap-2 px-8 py-4 bg-white border-2 border-gray-200 rounded-xl text-gray-700 font-semibold text-lg">
                            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            How It Works
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="mt-16 flex flex-wrap gap-8 md:gap-16">
                        <div>
                            <div className="text-4xl font-bold text-gray-900">99%</div>
                            <div className="text-sm text-gray-500 mt-1">Detection Accuracy</div>
                        </div>
                        <div>
                            <div className="text-4xl font-bold text-gray-900">24/7</div>
                            <div className="text-sm text-gray-500 mt-1">Live Monitoring</div>
                        </div>
                        <div>
                            <div className="text-4xl font-bold text-gray-900">2 sec</div>
                            <div className="text-sm text-gray-500 mt-1">Avg Response Time</div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Scan Modal */}
            <ScanModal isOpen={isScanModalOpen} onClose={() => setIsScanModalOpen(false)} />

        </section>
    );
};

export default HeroSection;
