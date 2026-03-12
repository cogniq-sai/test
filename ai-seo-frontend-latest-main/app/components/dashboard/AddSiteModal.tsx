"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addSite } from "../../lib/api";

interface AddSiteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSiteAdded: (siteUrl?: string) => void;
    token: string;
    userId: string;
}

type ModalStep = "input" | "loading" | "success";

export default function AddSiteModal({ isOpen, onClose, onSiteAdded, token, userId }: AddSiteModalProps) {
    const [siteUrl, setSiteUrl] = useState("");
    const [step, setStep] = useState<ModalStep>("input");
    const [siteId, setSiteId] = useState("");
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!siteUrl.trim()) {
            setError("Please enter a site URL");
            return;
        }

        if (!validateUrl(siteUrl)) {
            setError("Please enter a valid URL");
            return;
        }

        setStep("loading");

        try {
            const response = await addSite(token, siteUrl, userId);
            setSiteId(response.site_id);

            // Redirect directly to the site dashboard page
            // We do NOT close the modal or refresh the parent list here
            // to prevents a "flash" of the main dashboard before the redirect happens.
            router.push(`/dashboard/site/${response.site_id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add site");
            setStep("input");
        }
    };

    const handleStartAudit = () => {
        handleClose();
        router.push(`/dashboard/site/${siteId}`);
    };

    const handleClose = () => {
        setSiteUrl("");
        setStep("input");
        setSiteId("");
        setError("");
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-900">
                        {step === "success" ? "Site Added!" : "Add New Site"}
                    </h2>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6">
                    {step === "input" && (
                        <form onSubmit={handleSubmit}>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Website URL</label>
                                <input
                                    type="text"
                                    value={siteUrl}
                                    onChange={(e) => setSiteUrl(e.target.value)}
                                    placeholder="example.com"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900"
                                    autoFocus
                                />
                                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                                <p className="mt-2 text-xs text-gray-500">
                                    We&apos;ll crawl your site to find broken links and SEO issues.
                                </p>
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all"
                            >
                                Add Site
                            </button>
                        </form>
                    )}

                    {step === "loading" && (
                        <div className="py-8 text-center">
                            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-gray-600">Adding your site...</p>
                        </div>
                    )}

                    {step === "success" && (
                        <div className="text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Site Added Successfully!</h3>
                            <p className="text-gray-600 mb-6">
                                Your site is ready. Start an audit to find broken links and SEO issues.
                            </p>

                            <div className="space-y-3">
                                <button
                                    onClick={handleStartAudit}
                                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    Start Site Audit
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                                >
                                    I&apos;ll do it later
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
