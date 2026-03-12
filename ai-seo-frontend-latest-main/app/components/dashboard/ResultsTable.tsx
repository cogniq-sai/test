"use client";

import { useState } from "react";
import { ScanResult } from "./ScannerCard";

interface ResultsTableProps {
    results: ScanResult[];
    isLoading?: boolean;
}

// Mock data for testing
export const MOCK_SCAN_RESULTS: ScanResult[] = [
    {
        id: "1",
        type: "internal",
        sourceUrl: "/blog/getting-started-with-seo",
        brokenUrl: "/products/discontinued-tool",
        anchorText: "Check out our SEO tool",
        statusCode: 404
    },
    {
        id: "2",
        type: "external",
        sourceUrl: "/resources/helpful-links",
        brokenUrl: "https://defunct-website.com/article",
        anchorText: "External Guide",
        statusCode: 404
    },
    {
        id: "3",
        type: "internal",
        sourceUrl: "/about/team",
        brokenUrl: "/team/john-doe",
        anchorText: "John Doe - Former CEO",
        statusCode: 404
    }
];

export default function ResultsTable({ results, isLoading }: ResultsTableProps) {
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    const toggleRow = (id: string) => {
        const newSelected = new Set(selectedRows);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedRows(newSelected);
    };

    const getTypeStyles = (type: ScanResult["type"]) => {
        switch (type) {
            case "internal":
                return "bg-blue-100 text-blue-700";
            case "external":
                return "bg-orange-100 text-orange-700";
            case "plain":
                return "bg-gray-100 text-gray-700";
        }
    };

    const getStatusStyles = (code: number) => {
        if (code === 404) return "bg-red-100 text-red-700";
        if (code >= 500) return "bg-blue-100 text-blue-700";;
        if (code >= 400) return "bg-yellow-100 text-yellow-700";
        return "bg-gray-100 text-gray-600";
    };

    if (isLoading) {
        return (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
                <div className="flex items-center justify-center gap-3">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500">Loading results...</span>
                </div>
            </div>
        );
    }

    if (results.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Issues Found</h3>
                <p className="text-gray-500">Run a site audit to discover broken links and SEO issues.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Broken Links Found</h3>
                    <p className="text-sm text-gray-500">{results.length} issue{results.length !== 1 ? 's' : ''} detected</p>
                </div>
                {selectedRows.size > 0 && (
                    <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-cyan-600 transition-colors">
                        Fix {selectedRows.size} Selected
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Source Page
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Broken Link
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Type
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Action
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {results.map((result) => (
                            <tr
                                key={result.id}
                                className={`hover:bg-gray-50 transition-colors ${selectedRows.has(result.id) ? 'bg-blue-50' : ''}`}
                            >
                                <td className="px-6 py-4">
                                    <div className="max-w-xs">
                                        <p className="text-sm font-medium text-gray-900 truncate">
                                            {result.sourceUrl}
                                        </p>
                                        {result.anchorText && (
                                            <p className="text-xs text-gray-500 truncate">
                                                &quot;{result.anchorText}&quot;
                                            </p>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-sm text-red-600 font-mono truncate max-w-xs">
                                        {result.brokenUrl}
                                    </p>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getTypeStyles(result.type)}`}>
                                        {result.type.charAt(0).toUpperCase() + result.type.slice(1)}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusStyles(result.statusCode)}`}>
                                        {result.statusCode}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => toggleRow(result.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedRows.has(result.id)
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        {selectedRows.has(result.id) ? 'Selected' : 'Select'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
