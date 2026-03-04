"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ScanModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ScanModal({ isOpen, onClose }: ScanModalProps) {
    const [siteUrl, setSiteUrl] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();

    const validateUrl = (url: string): boolean => {
        try {
            const urlToTest = url.startsWith("http") ? url : `https://${url}`;
            new URL(urlToTest);
            return true;
        } catch {
            return false;
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
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

        // Close modal and redirect to signup
        handleClose();
        router.push("/login?mode=signup");
    };

    const handleClose = () => {
        setSiteUrl("");
        setError("");
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Close button */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-colors z-10"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="p-8">
                    {/* Icon */}
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/25">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5" />
                        </svg>
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
                        Scan Your Website
                    </h2>
                    <p className="text-gray-500 text-center mb-8">
                        Enter your site URL and we&apos;ll find broken links & SEO issues instantly.
                    </p>

                    {/* Form */}
                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    value={siteUrl}
                                    onChange={(e) => { setSiteUrl(e.target.value); setError(""); }}
                                    placeholder="yourwebsite.com"
                                    className="w-full pl-12 pr-4 py-4 bg-gray-50/80 border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all duration-200 placeholder:text-gray-400 text-gray-800 text-lg"
                                    autoFocus
                                />
                            </div>
                            {error && (
                                <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5">
                                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {error}
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Start Free Scan
                        </button>

                        <p className="text-center text-xs text-gray-400 mt-4">
                            Free account required. No credit card needed.
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
