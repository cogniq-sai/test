"use client";

import { useState, useMemo, Fragment } from "react";
import type { RedirectSuggestion } from "../../lib/api/redirects";

type FilterType = "all" | "internal" | "external";

interface RedirectTableProps {
    suggestions: RedirectSuggestion[];
    siteUrl?: string; // Used to determine internal vs external
    onApprove: (id: string, option: "primary" | "alternative") => void;
    onReject: (id: string) => void;
    onEditCustom: (id: string, customUrl: string) => void;
    isLoading?: boolean;
}

/** Check if a broken_url is internal (same domain as the site) */
function isInternalUrl(brokenUrl: string, siteUrl?: string): boolean {
    if (!siteUrl) return true; // Default to internal if no site URL
    try {
        const brokenHost = new URL(brokenUrl).hostname.replace(/^www\./, "");
        const siteHost = new URL(siteUrl).hostname.replace(/^www\./, "");
        return brokenHost === siteHost;
    } catch {
        return true;
    }
}

export default function RedirectTable({ suggestions, siteUrl, onApprove, onReject, onEditCustom, isLoading }: RedirectTableProps) {
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [selectedOptions, setSelectedOptions] = useState<Record<string, "primary" | "alternative">>({});
    const [activeFilter, setActiveFilter] = useState<FilterType>("all");

    // Counts for filter badges
    const counts = useMemo(() => {
        let internal = 0, external = 0;
        suggestions.forEach(s => {
            if (isInternalUrl(s.broken_url, siteUrl)) internal++;
            else external++;
        });
        return { all: suggestions.length, internal, external };
    }, [suggestions, siteUrl]);

    // Filtered list
    const filtered = useMemo(() => {
        if (activeFilter === "all") return suggestions;
        return suggestions.filter(s => {
            const isInternal = isInternalUrl(s.broken_url, siteUrl);
            return activeFilter === "internal" ? isInternal : !isInternal;
        });
    }, [suggestions, activeFilter, siteUrl]);

    const toggleExpand = (id: string) => {
        setExpandedRow(prev => prev === id ? null : id);
    };

    const getActiveOption = (s: RedirectSuggestion): "primary" | "alternative" =>
        selectedOptions[s.id] || "primary";

    const getActiveUrl = (s: RedirectSuggestion) => {
        const opt = getActiveOption(s);
        return opt === "alternative" && s.alternative_url ? s.alternative_url : s.primary_url;
    };

    const getActiveConfidence = (s: RedirectSuggestion) => {
        const opt = getActiveOption(s);
        return opt === "alternative" && s.alternative_confidence != null ? s.alternative_confidence : s.primary_confidence;
    };

    const getActiveReason = (s: RedirectSuggestion) => {
        const opt = getActiveOption(s);
        return opt === "alternative" && s.alternative_reason ? s.alternative_reason : s.primary_reason;
    };

    const startEdit = (id: string, currentTarget: string) => {
        setEditingRow(id);
        setEditValue(currentTarget);
    };

    const saveEdit = (id: string) => {
        if (editValue.trim()) onEditCustom(id, editValue.trim());
        setEditingRow(null);
        setEditValue("");
    };

    const cancelEdit = () => {
        setEditingRow(null);
        setEditValue("");
    };

    /** Truncate long URLs for display, keeping domain + last segment */
    const truncateUrl = (url: string, maxLen = 55) => {
        if (url.length <= maxLen) return url;
        try {
            const u = new URL(url);
            const path = u.pathname;
            const parts = path.split("/").filter(Boolean);
            if (parts.length <= 2) return url;
            return `${u.origin}/.../${parts[parts.length - 1]}${u.search}`;
        } catch {
            return url.slice(0, maxLen - 3) + "...";
        }
    };

    const confidenceDot = (conf: number) => {
        if (conf >= 80) return { bg: "bg-green-500", ring: "ring-green-200", text: "text-green-700", label: "High" };
        if (conf >= 50) return { bg: "bg-yellow-500", ring: "ring-yellow-200", text: "text-yellow-700", label: "Medium" };
        return { bg: "bg-red-500", ring: "ring-red-200", text: "text-red-700", label: "Low" };
    };

    return (
        <div className="space-y-4">
            {/* ─── Filter Bar ─── */}
            <div className="flex items-center justify-end flex-wrap gap-3">
                <div className="inline-flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
                    {(["all", "internal", "external"] as FilterType[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setActiveFilter(f)}
                            className={`
                                inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                                ${activeFilter === f
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                                }
                            `}
                        >
                            {f === "all" && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            )}
                            {f === "internal" && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
                                </svg>
                            )}
                            {f === "external" && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            )}
                            <span className="capitalize">{f}</span>
                            <span className={`
                                inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-xs font-semibold
                                ${activeFilter === f ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600"}
                            `}>
                                {counts[f]}
                            </span>
                        </button>
                    ))}
                </div>

                {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                        <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                        Updating...
                    </div>
                )}
            </div>

            {/* ─── Table ─── */}
            <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full table-fixed">
                    <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[28%]" />
                        <col className="w-[12%]" />
                        <col className="w-[14%]" />
                        <col className="w-[16%]" />
                    </colgroup>
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Source URL</th>
                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Suggested Target</th>
                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Confidence</th>
                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Reasoning</th>
                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {filtered.map((s) => {
                            const isExpanded = expandedRow === s.id;
                            const isEditing = editingRow === s.id;
                            const conf = getActiveConfidence(s);
                            const cd = confidenceDot(conf);
                            const isInternal = isInternalUrl(s.broken_url, siteUrl);

                            return (
                                <Fragment key={s.id}>
                                    <tr className="group hover:bg-gray-50/50 transition-colors">
                                        {/* Source URL */}
                                        <td className="px-5 py-4 align-top">
                                            <div className="flex items-start gap-2 min-w-0">
                                                <span className={`mt-0.5 flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isInternal ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                                                    {isInternal ? "INT" : "EXT"}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <a href={s.broken_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-red-600 hover:text-red-800 hover:underline truncate block" title={s.broken_url}>
                                                        {truncateUrl(s.broken_url)}
                                                    </a>
                                                    <p className="text-xs text-gray-400 mt-1 truncate" title={s.source_url}>
                                                        Found on: <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-600 hover:underline">{truncateUrl(s.source_url, 45)}</a>
                                                    </p>
                                                    {s.anchor_text && s.anchor_text !== "N/A" && s.anchor_text.trim() !== "" && (
                                                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                                                            Anchor: &quot;{s.anchor_text}&quot;
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Suggested Target */}
                                        <td className="px-5 py-4 align-top">
                                            {isEditing ? (
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        type="text"
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        onKeyDown={(e) => e.key === "Enter" && saveEdit(s.id)}
                                                        className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                        placeholder="Custom URL"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => saveEdit(s.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md flex-shrink-0">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    </button>
                                                    <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md flex-shrink-0">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-emerald-600 truncate" title={getActiveUrl(s)}>
                                                        {truncateUrl(getActiveUrl(s))}
                                                    </p>
                                                    {s.alternative_url && s.status === "pending" && (
                                                        <div className="flex items-center gap-1.5 mt-2">
                                                            <button
                                                                onClick={() => setSelectedOptions(prev => ({ ...prev, [s.id]: "primary" }))}
                                                                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${getActiveOption(s) === "primary"
                                                                    ? "bg-blue-100 text-blue-700"
                                                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                                    }`}
                                                            >
                                                                Primary
                                                            </button>
                                                            <button
                                                                onClick={() => setSelectedOptions(prev => ({ ...prev, [s.id]: "alternative" }))}
                                                                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${getActiveOption(s) === "alternative"
                                                                    ? "bg-purple-100 text-purple-700"
                                                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                                    }`}
                                                            >
                                                                Alt
                                                            </button>
                                                        </div>
                                                    )}
                                                    <p className="text-[11px] text-gray-400 mt-1">{s.primary_redirect_type} redirect</p>
                                                </div>
                                            )}
                                        </td>

                                        {/* Confidence */}
                                        <td className="px-5 py-4 align-top">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2.5 h-2.5 rounded-full ${cd.bg} ring-4 ${cd.ring} flex-shrink-0`} />
                                                <span className={`text-sm font-semibold ${cd.text}`}>{conf}%</span>
                                            </div>
                                            <p className={`text-[11px] mt-1 ${cd.text} opacity-75`}>{cd.label}</p>
                                        </td>

                                        {/* AI Reasoning toggle */}
                                        <td className="px-5 py-4 align-top">
                                            <button
                                                onClick={() => toggleExpand(s.id)}
                                                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600 transition-colors"
                                            >
                                                <svg
                                                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                                {isExpanded ? "Hide" : "Show Reasoning"}
                                            </button>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-5 py-4 align-top">
                                            {s.status === "pending" ? (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => onApprove(s.id, getActiveOption(s))}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                                                        title="Approve"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => onReject(s.id)}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Reject"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => startEdit(s.id, getActiveUrl(s))}
                                                        className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 rounded-lg transition-colors"
                                                        title="Custom URL"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${s.status === "approved" ? "bg-green-100 text-green-700"
                                                    : s.status === "rejected" ? "bg-red-100 text-red-700"
                                                        : "bg-blue-100 text-blue-700"
                                                    }`}>
                                                    {s.status === "approved" && (
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    )}
                                                    {s.status === "rejected" && (
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    )}
                                                    <span className="capitalize">{s.status}</span>
                                                    {s.selected_option && s.status === "approved" && (
                                                        <span className="opacity-60">({s.selected_option})</span>
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                    </tr>

                                    {/* Expanded AI Reasoning — full-width row directly below */}
                                    {isExpanded && (
                                        <tr className="bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-blue-50/80 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <td colSpan={5} className="px-5 py-3">
                                                <p className="text-sm text-gray-700 leading-relaxed">
                                                    <span className="font-semibold text-blue-700">AI Reasoning:</span>{" "}
                                                    {getActiveReason(s)}
                                                </p>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ─── Empty State ─── */}
            {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h4 className="text-base font-semibold text-gray-900">
                        {suggestions.length === 0
                            ? "No redirect suggestions yet"
                            : `No ${activeFilter} broken links found`
                        }
                    </h4>
                    <p className="text-sm text-gray-500 mt-1 text-center max-w-sm">
                        {suggestions.length === 0
                            ? "Run a scan to find 404 errors, then AI will generate redirect suggestions."
                            : `Try switching to a different filter to see more results.`
                        }
                    </p>
                </div>
            )}
        </div>
    );
}
