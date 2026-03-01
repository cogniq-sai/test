"use client";

import { useState, useEffect } from "react";

interface PluginSetupModalProps {
    siteUrl: string;
    apiKey: string;
    onCheckConnection: () => Promise<boolean>;
    onClose: () => void;
}

export default function PluginSetupModal({ siteUrl, apiKey, onCheckConnection, onClose }: PluginSetupModalProps) {
    const [copied, setCopied] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);

    // Derive WP admin URL
    const wpAdminUrl = siteUrl.replace(/\/$/, "") + "/wp-admin";

    const copyApiKey = async () => {
        try {
            await navigator.clipboard.writeText(apiKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = apiKey;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleCheck = async () => {
        setIsChecking(true);
        // Don't clear error here to avoid fluctuation
        const result = await onCheckConnection();
        if (result) {
            setIsConnected(true);
            setCheckError(null); // Clear error on success
            setTimeout(() => {
                onClose();
            }, 1200);
        } else {
            setCheckError("Plugin is not connected yet.");
            setIsChecking(false);
        }
    };

    const isApiKeyMissing = !apiKey || apiKey === "API key not found";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
                <div className="p-6 sm:p-8">
                    {/* Header with Theme Gradient Icon */}
                    <div className="flex items-start justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 leading-tight">Connect Your Site</h3>
                                <p className="text-sm text-gray-500 mt-0.5">Setup the connection to apply changes</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 transition-all p-2 rounded-lg"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Steps */}
                    <div className="space-y-6 mb-8">
                        {/* Step 1 */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white text-[10px] font-bold flex items-center justify-center mt-0.5 shadow-sm shadow-blue-500/20">1</div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Install AutoRankr AI Plugin</p>
                                <a
                                    href={wpAdminUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1 font-medium hover:underline"
                                >
                                    Open WordPress Admin
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white text-[10px] font-bold flex items-center justify-center mt-0.5 shadow-sm shadow-blue-500/20">2</div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Go to Plugin Settings</p>
                                <p className="text-xs text-gray-500 mt-1">Found under <span className="font-semibold text-gray-700">AutoRankr AI → Settings</span> in your WP sidebar.</p>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white text-[10px] font-bold flex items-center justify-center mt-0.5 shadow-sm shadow-blue-500/20">3</div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Connect with API Key</p>
                                <p className="text-xs text-gray-500 mt-1">Paste the key below into the API Key field and save.</p>
                            </div>
                        </div>
                    </div>

                    {/* API Key Box */}
                    <div className="mb-6">
                        <div className={`border rounded-xl p-3 flex items-center bg-gray-50 transition-colors ${isApiKeyMissing ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
                            {isApiKeyMissing ? (
                                <span className="text-sm text-red-600 font-medium w-full text-center py-1">API Key not found. Please refresh.</span>
                            ) : (
                                <code className="flex-1 font-mono text-[13px] text-gray-700 break-all select-all mr-2 px-1">
                                    {apiKey}
                                </code>
                            )}

                            {!isApiKeyMissing && (
                                <button
                                    onClick={copyApiKey}
                                    className={`w-16 h-8 flex-shrink-0 rounded-lg text-xs font-bold transition-all flex items-center justify-center border shadow-sm ${copied
                                        ? "bg-green-50 border-green-200 text-green-700"
                                        : "bg-white border-gray-100 text-gray-700 hover:bg-gray-50"
                                        }`}
                                >
                                    {copied ? "Copied" : "Copy"}
                                </button>
                            )}
                        </div>
                        {/* Status/Error Message Area - Stabilized Height to prevent jumping */}
                        <div className="h-[22px] flex items-center">
                            {(checkError || isConnected) && (
                                <div className={`mt-3 text-xs font-bold flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 px-1 ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        {isConnected ? (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        ) : (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        )}
                                    </svg>
                                    <span className="truncate whitespace-nowrap">{isConnected ? "Plugin is online now!" : checkError}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions - Minimalist Row */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                        <div className="flex items-center gap-2.5">
                            <div className="h-2 w-2 rounded-full animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] shadow-sm transform-gpu transition-colors duration-500">
                                <div className={`h-full w-full rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'}`}></div>
                            </div>
                            <span className={`text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${isConnected ? 'text-green-600' : 'text-gray-400'}`}>
                                {isConnected ? 'Online' : 'Not Connected'}
                            </span>
                        </div>

                        <button
                            onClick={handleCheck}
                            disabled={isChecking || isConnected}
                            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 w-[190px] h-[40px] flex-shrink-0 ${isConnected
                                ? 'bg-green-600 text-white shadow-lg shadow-green-500/20'
                                : isChecking
                                    ? 'bg-blue-50 text-blue-600 cursor-not-allowed border border-blue-100'
                                    : 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25 hover:opacity-90 active:scale-[0.98]'
                                }`}
                        >
                            {isChecking ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Checking...
                                </>
                            ) : isConnected ? (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Connected
                                </>
                            ) : (
                                "Check Connection"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
