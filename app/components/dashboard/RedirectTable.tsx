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
    onApproveCustom: (id: string) => void;
    onUndo?: (id: string) => void;
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

export default function RedirectTable({ suggestions, siteUrl, onApprove, onReject, onEditCustom, onApproveCustom, onUndo, isLoading }: RedirectTableProps) {
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [selectedOptions, setSelectedOptions] = useState<Record<string, "primary" | "alternative" | "custom">>({});
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

    const getActiveOption = (s: RedirectSuggestion): "primary" | "alternative" | "custom" =>
        selectedOptions[s.id] || (s.selected_option === "custom" ? "custom" : "primary");

    const getActiveUrl = (s: RedirectSuggestion) => {
        const opt = getActiveOption(s);
        // Priority 1: User-selected custom URL (stored in DB)
        if (s.selected_option === "custom" && s.custom_redirect_url) return s.custom_redirect_url;
        // Priority 2: Local UI selection
        if (opt === "custom" && s.custom_redirect_url) return s.custom_redirect_url;
        if (opt === "alternative" && s.alternative_url) return s.alternative_url;
        // Priority 3: Default AI suggestion or self-link
        return s.primary_url || s.broken_url;
    };

    const getActiveConfidence = (s: RedirectSuggestion) => {
        const opt = getActiveOption(s);
        if (opt === "custom") return s.primary_confidence; // custom has no separate confidence
        return opt === "alternative" && s.alternative_confidence != null ? s.alternative_confidence : s.primary_confidence;
    };

    const getActiveReason = (s: RedirectSuggestion) => {
        const opt = getActiveOption(s);
        if (opt === "custom") return null; // custom has no AI reason
        return opt === "alternative" && s.alternative_reason ? s.alternative_reason : s.primary_reason;
    };

    const startEdit = (id: string, currentTarget: string) => {
        setEditingRow(id);
        setEditValue(currentTarget);
    };

    const saveEdit = (id: string) => {
        const trimmed = editValue.trim();
        const suggestion = suggestions.find(s => s.id === id);
        if (!suggestion) {
            setEditingRow(null);
            setEditValue("");
            return;
        }

        const isInternal = isInternalUrl(suggestion.broken_url, siteUrl);
        const currentUrl = getActiveUrl(suggestion);

        // For external links, if they save a URL that is just the broken_url, it's not a custom redirect
        if (!isInternal && trimmed === suggestion.broken_url) {
            setEditingRow(null);
            setEditValue("");
            return;
        }

        // Only create custom if URL actually changed
        if (trimmed && trimmed !== currentUrl) {
            onEditCustom(id, trimmed);
            // Auto-select 'custom' tag so they approve the right thing
            setSelectedOptions(prev => ({ ...prev, [id]: "custom" }));
            // Close reasoning drawer — custom entries have no AI reasoning
            if (expandedRow === id) setExpandedRow(null);
        }
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
                        <col className="w-[10%]" />
                        <col className="w-[14%]" />
                        <col className="w-[18%]" />
                    </colgroup>
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Source URL</th>
                            <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Redirection</th>
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

                                        {/* Redirection */}
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
                                                    <button onClick={() => saveEdit(s.id)} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg flex-shrink-0 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    </button>
                                                    <button onClick={cancelEdit} className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg flex-shrink-0 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            ) : isInternal ? (
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-emerald-600 truncate" title={getActiveUrl(s)}>
                                                        {truncateUrl(getActiveUrl(s))}
                                                    </p>
                                                    {s.status === "pending" ? (
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
                                                            {s.alternative_url && (
                                                                <button
                                                                    onClick={() => setSelectedOptions(prev => ({ ...prev, [s.id]: "alternative" }))}
                                                                    className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${getActiveOption(s) === "alternative"
                                                                        ? "bg-blue-100 text-blue-700"
                                                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                                        }`}
                                                                >
                                                                    Alt
                                                                </button>
                                                            )}
                                                            {s.selected_option === "custom" && s.custom_redirect_url && (
                                                                <button
                                                                    onClick={() => setSelectedOptions(prev => ({ ...prev, [s.id]: "custom" }))}
                                                                    className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${getActiveOption(s) === "custom"
                                                                        ? "bg-blue-100 text-blue-700"
                                                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                                        }`}
                                                                >
                                                                    Custom
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        /* Approved/rejected: show only the selected tag */
                                                        <span className="inline-block mt-1.5 px-2 py-0.5 text-[11px] rounded font-medium bg-blue-100 text-blue-700">
                                                            {s.selected_option === "custom" ? "Custom" : s.selected_option === "alternative" ? "Alt" : "Primary"}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                /* External URL: show target URL + selectable tags if pending */
                                                <div className="min-w-0">
                                                    <p
                                                        className={`text-sm font-medium text-emerald-600 truncate ${getActiveOption(s) === "primary" && s.status === "pending" ? "cursor-help" : ""}`}
                                                        title={getActiveOption(s) === "primary" && s.status === "pending" ? "External 404 Url - Either add custom redirection url or unlink it." : undefined}
                                                    >
                                                        {truncateUrl(getActiveUrl(s))}
                                                    </p>
                                                    {s.status === "pending" ? (
                                                        <div className="flex items-center gap-1.5 mt-2">
                                                            <button
                                                                onClick={() => setSelectedOptions(prev => ({ ...prev, [s.id]: "primary" }))}
                                                                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${getActiveOption(s) === "primary"
                                                                    ? "bg-blue-100 text-blue-700"
                                                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                                    }`}
                                                            >
                                                                External Link
                                                            </button>
                                                            {(s.custom_redirect_url || selectedOptions[s.id] === "custom") && (
                                                                <button
                                                                    onClick={() => setSelectedOptions(prev => ({ ...prev, [s.id]: "custom" }))}
                                                                    className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${getActiveOption(s) === "custom"
                                                                        ? "bg-blue-100 text-blue-700"
                                                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                                        }`}
                                                                >
                                                                    Custom
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        /* Approved/rejected: show only the selected tag */
                                                        <span className="inline-block mt-1.5 px-2 py-0.5 text-[11px] rounded font-medium bg-blue-100 text-blue-700">
                                                            {s.selected_option === "custom" ? "Custom" : "External Link"}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* Confidence */}
                                        <td className="px-5 py-4 align-top">
                                            {isInternal ? (
                                                <>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2.5 h-2.5 rounded-full ${cd.bg} ring-4 ${cd.ring} flex-shrink-0`} />
                                                        <span className={`text-sm font-semibold ${cd.text}`}>{conf}%</span>
                                                    </div>
                                                    <p className={`text-[11px] mt-1 ${cd.text} opacity-75`}>{cd.label}</p>
                                                </>
                                            ) : (
                                                <span className="text-sm text-gray-400">&mdash;</span>
                                            )}
                                        </td>

                                        {/* AI Reasoning toggle — hidden for custom entries and external URLs */}
                                        <td className="px-5 py-4 align-top">
                                            {!isInternal ? (
                                                <span className="text-sm text-gray-400">&mdash;</span>
                                            ) : getActiveOption(s) !== "custom" ? (
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
                                            ) : (
                                                <span className="text-xs text-gray-400">&mdash;</span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-5 py-4 align-middle">
                                            {s.status === "pending" && isInternal ? (
                                                /* Internal: Approve / Reject / Edit / Unlink */
                                                <div className="grid grid-cols-2 gap-1 w-[160px]">
                                                    {/* Row 1: Approve + Reject */}
                                                    <button
                                                        disabled={!isInternal && getActiveOption(s) === "primary"}
                                                        onClick={() =>
                                                            getActiveOption(s) === "custom"
                                                                ? onApproveCustom(s.id)
                                                                : onApprove(s.id, getActiveOption(s) as "primary" | "alternative")
                                                        }
                                                        className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 h-[30px] text-xs font-medium border rounded-lg transition-colors w-full ${!isInternal && getActiveOption(s) === "primary"
                                                            ? "bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed"
                                                            : "text-green-700 bg-green-50 hover:bg-green-100 border-green-200"}`}
                                                        title={!isInternal && getActiveOption(s) === "primary" ? "External links require a custom URL to approve" : "Approve redirect"}
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => onReject(s.id)}
                                                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1 h-[30px] text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors w-full"
                                                        title="Reject suggestion"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                        Reject
                                                    </button>

                                                    {/* Row 2: Edit (icon-only) */}
                                                    <button
                                                        onClick={() => startEdit(s.id, getActiveUrl(s))}
                                                        className="inline-flex items-center justify-center px-2.5 py-1 h-[30px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg transition-colors w-full"
                                                        title="Custom URL"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                    <span />
                                                </div>
                                            ) : s.status === "pending" && !isInternal ? (
                                                /* External: Actions depend on selected tag (External Link vs Custom) */
                                                <div className="grid grid-cols-2 gap-1 w-[160px]">
                                                    {getActiveOption(s) === "custom" ? (
                                                        /* Custom tag active: show Approve / Reject / Edit / Unlink */
                                                        <>
                                                            <button
                                                                disabled={getActiveOption(s) === "primary"}
                                                                onClick={() => onApproveCustom(s.id)}
                                                                className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 h-[30px] text-xs font-medium border rounded-lg transition-colors w-full ${getActiveOption(s) === "primary"
                                                                    ? "bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed"
                                                                    : "text-green-700 bg-green-50 hover:bg-green-100 border-green-200"}`}
                                                                title={getActiveOption(s) === "primary" ? "Provide a custom URL first" : "Approve redirect"}
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => onReject(s.id)}
                                                                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 h-[30px] text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors w-full"
                                                                title="Reject suggestion"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                                Reject
                                                            </button>
                                                            <button
                                                                onClick={() => startEdit(s.id, getActiveUrl(s))}
                                                                className="inline-flex items-center justify-center px-2.5 py-1 h-[30px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg transition-colors w-full"
                                                                title="Edit custom URL"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                disabled
                                                                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 h-[30px] text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg cursor-not-allowed opacity-60 transition-colors w-full"
                                                                title="Unlink — coming soon"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                                    <line x1="4" y1="4" x2="20" y2="20" strokeWidth={2} strokeLinecap="round" />
                                                                </svg>
                                                                Unlink
                                                            </button>
                                                        </>
                                                    ) : (
                                                        /* External Link tag active: show Edit + Unlink on top row with spacers below to maintain height */
                                                        <>
                                                            <button
                                                                onClick={() => startEdit(s.id, s.broken_url)}
                                                                className="inline-flex items-center justify-center px-2.5 py-1 h-[30px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg transition-colors w-full"
                                                                title="Set custom redirect URL"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                disabled
                                                                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 h-[30px] text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg cursor-not-allowed opacity-60 transition-colors w-full"
                                                                title="Unlink — coming soon"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                                    <line x1="4" y1="4" x2="20" y2="20" strokeWidth={2} strokeLinecap="round" />
                                                                </svg>
                                                                Unlink
                                                            </button>
                                                            <div className="h-[30px]" /> {/* Spacer row 2, col 1 */}
                                                            <div className="h-[30px]" /> {/* Spacer row 2, col 2 */}
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                /* Approved, Applied, Rejected, etc: Show status and Undo */
                                                <div className="flex flex-col justify-center min-h-[64px] w-[160px]">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${s.status === "applied" ? "bg-emerald-100 text-emerald-700"
                                                            : s.status === "approved" ? "bg-green-100 text-green-700"
                                                                : s.status === "rejected" ? "bg-red-100 text-red-700"
                                                                    : s.status === "undone" ? "bg-gray-100 text-gray-600"
                                                                        : s.status === "reverted" ? "bg-yellow-100 text-yellow-700"
                                                                            : s.status === "failed" ? "bg-red-100 text-red-700 cursor-help"
                                                                                : "bg-blue-100 text-blue-700"
                                                            }`}
                                                            title={s.status === "failed" ? (s.primary_reason || "Unknown failure") : undefined}
                                                        >
                                                            {s.status === "applied" && (
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                            )}
                                                            {(s.status === "approved" || s.status === "reverted") && (
                                                                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                            )}
                                                            {s.status === "undone" && (
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg>
                                                            )}
                                                            {s.status === "failed" && (
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                            )}
                                                            <span className="capitalize">
                                                                {s.status === "applied" ? "Live"
                                                                    : s.status === "approved" ? "Applying..."
                                                                        : s.status === "reverted" ? "Reverting..."
                                                                            : s.status}
                                                            </span>
                                                        </span>
                                                        {(s.status === "applied" || s.status === "rejected" || s.status === "failed") && onUndo && (
                                                            <button
                                                                onClick={() => onUndo(s.id)}
                                                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-50 hover:bg-red-50 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-lg transition-colors"
                                                                title="Undo this redirect"
                                                            >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
                                                                </svg>
                                                                Undo
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>

                                    {/* Expanded AI Reasoning — hidden for custom entries */}
                                    {
                                        isExpanded && getActiveOption(s) !== "custom" && (
                                            <tr className="bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-blue-50/80 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <td colSpan={5} className="px-5 py-3">
                                                    <p className="text-sm text-gray-700 leading-relaxed">
                                                        <span className="font-semibold text-blue-700">AI Reasoning:</span>{" "}
                                                        {getActiveReason(s)}
                                                    </p>
                                                </td>
                                            </tr>
                                        )
                                    }
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ─── Empty State ─── */}
            {
                filtered.length === 0 && (
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
                )
            }
        </div >
    );
}
