"use client";

import { useState } from "react";

interface ApiKeyCardProps {
    apiKey: string;
    siteName?: string;
}

export default function ApiKeyCard({ apiKey, siteName }: ApiKeyCardProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [copied, setCopied] = useState(false);

    const maskedKey = apiKey.slice(0, 7) + "••••••••••••" + apiKey.slice(-4);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(apiKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    return (
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50">
            {siteName && (
                <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{siteName}</h3>
                </div>
            )}

            <div className="mb-3">
                <label className="text-sm font-medium text-gray-500">API Key</label>
            </div>

            <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-sm text-gray-800 overflow-hidden">
                    <span className="truncate block">
                        {isVisible ? apiKey : maskedKey}
                    </span>
                </div>

                {/* Show/Hide Toggle */}
                <button
                    onClick={() => setIsVisible(!isVisible)}
                    className="p-3 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 hover:text-gray-700"
                    title={isVisible ? "Hide API Key" : "Show API Key"}
                >
                    {isVisible ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    )}
                </button>

                {/* Copy Button */}
                <button
                    onClick={handleCopy}
                    className={`p-3 rounded-xl transition-all ${copied
                            ? "bg-green-100 text-green-600"
                            : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                        }`}
                    title="Copy API Key"
                >
                    {copied ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    )}
                </button>
            </div>

            <p className="text-sm text-gray-500">
                Use this API key in the <span className="font-medium text-gray-700">Cogniq WordPress plugin</span> to connect your site.
            </p>

            {copied && (
                <div className="mt-3 text-sm text-green-600 font-medium flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied to clipboard!
                </div>
            )}
        </div>
    );
}
