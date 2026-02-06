"use client";

import { useState } from "react";

interface RedirectEntry {
    id: string;
    sourceUrl: string;
    suggestedTarget: string;
    confidence: number;
    aiReasoning: string;
    status: "pending" | "approved" | "rejected";
    detectedAt: string;
}

interface RedirectTableProps {
    redirects: RedirectEntry[];
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onEdit: (id: string, newTarget: string) => void;
}

export default function RedirectTable({ redirects, onApprove, onReject, onEdit }: RedirectTableProps) {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    };

    const getConfidenceBadge = (confidence: number) => {
        if (confidence >= 80) {
            return (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                    High ({confidence}%)
                </span>
            );
        } else if (confidence >= 60) {
            return (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                    Medium ({confidence}%)
                </span>
            );
        } else {
            return (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                    Low ({confidence}%)
                </span>
            );
        }
    };

    const startEdit = (id: string, currentTarget: string) => {
        setEditingRow(id);
        setEditValue(currentTarget);
    };

    const saveEdit = (id: string) => {
        onEdit(id, editValue);
        setEditingRow(null);
        setEditValue("");
    };

    const cancelEdit = () => {
        setEditingRow(null);
        setEditValue("");
    };

    return (
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/50 border border-white/60 overflow-hidden">
            {/* Table Header */}
            <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">404 Suggestions</h3>
                <p className="text-sm text-gray-500 mt-1">Review and approve AI-suggested redirects</p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50/50">
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Source URL</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Suggested Target</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Confidence</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Reasoning</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {redirects.map((redirect) => (
                            <tr key={redirect.id} className="hover:bg-gray-50/50 transition-colors">
                                {/* Source URL - Red */}
                                <td className="px-6 py-4">
                                    <span className="text-red-600 font-mono text-sm break-all">
                                        {redirect.sourceUrl}
                                    </span>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Detected: {redirect.detectedAt}
                                    </p>
                                </td>

                                {/* Suggested Target - Green/Editable */}
                                <td className="px-6 py-4">
                                    {editingRow === redirect.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                                            />
                                            <button
                                                onClick={() => saveEdit(redirect.id)}
                                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={cancelEdit}
                                                className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-green-600 font-mono text-sm break-all">
                                            {redirect.suggestedTarget}
                                        </span>
                                    )}
                                </td>

                                {/* Confidence Badge */}
                                <td className="px-6 py-4">
                                    {getConfidenceBadge(redirect.confidence)}
                                </td>

                                {/* AI Reasoning - Expandable */}
                                <td className="px-6 py-4">
                                    <button
                                        onClick={() => toggleExpand(redirect.id)}
                                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        {expandedRows.has(redirect.id) ? (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                </svg>
                                                Hide
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                                View
                                            </>
                                        )}
                                    </button>
                                    {expandedRows.has(redirect.id) && (
                                        <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm text-gray-700">
                                            {redirect.aiReasoning}
                                        </div>
                                    )}
                                </td>

                                {/* Actions */}
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        {redirect.status === "pending" && (
                                            <>
                                                <button
                                                    onClick={() => onApprove(redirect.id)}
                                                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                    title="Approve"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => onReject(redirect.id)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Reject"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => startEdit(redirect.id, redirect.suggestedTarget)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Edit"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                            </>
                                        )}
                                        {redirect.status === "approved" && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Approved
                                            </span>
                                        )}
                                        {redirect.status === "rejected" && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                                Rejected
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Empty State */}
            {redirects.length === 0 && (
                <div className="px-6 py-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900">No 404 errors detected</h4>
                    <p className="text-gray-500 mt-1">Your site is running smoothly!</p>
                </div>
            )}
        </div>
    );
}
