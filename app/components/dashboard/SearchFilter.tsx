"use client";

import { useState, useRef, useEffect } from "react";

interface SearchFilterProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    filterType: 'all' | 'scanned' | 'never-scanned';
    onFilterChange: (filter: 'all' | 'scanned' | 'never-scanned') => void;
    sortType: 'last-scanned' | 'alphabetical';
    onSortChange: (sort: 'last-scanned' | 'alphabetical') => void;
    totalCount: number;
    filteredCount: number;
}

export default function SearchFilter({
    searchQuery,
    onSearchChange,
    filterType,
    onFilterChange,
    sortType,
    onSortChange,
    totalCount,
    filteredCount
}: SearchFilterProps) {
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);
    const sortRef = useRef<HTMLDivElement>(null);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
            if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
                setIsSortOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filterLabels = {
        'all': 'All Sites',
        'scanned': 'Scanned',
        'never-scanned': 'Never Scanned'
    };

    const sortLabels = {
        'last-scanned': 'Last Scanned',
        'alphabetical': 'Alphabetical'
    };

    return (
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search sites..."
                        className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 placeholder-gray-400"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => onSearchChange('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        >
                            <svg className="w-5 h-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Filter and Sort Controls */}
                <div className="flex gap-3">
                    {/* Filter Dropdown */}
                    <div className="relative" ref={filterRef}>
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            {filterLabels[filterType]}
                            <svg className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {isFilterOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                                <button
                                    onClick={() => { onFilterChange('all'); setIsFilterOpen(false); }}
                                    className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between ${filterType === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    All Sites
                                    {filterType === 'all' && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    onClick={() => { onFilterChange('scanned'); setIsFilterOpen(false); }}
                                    className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between ${filterType === 'scanned' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    Scanned
                                    {filterType === 'scanned' && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    onClick={() => { onFilterChange('never-scanned'); setIsFilterOpen(false); }}
                                    className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between ${filterType === 'never-scanned' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    Never Scanned
                                    {filterType === 'never-scanned' && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Sort Dropdown */}
                    <div className="relative" ref={sortRef}>
                        <button
                            onClick={() => setIsSortOpen(!isSortOpen)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                            </svg>
                            Sort
                            <svg className={`w-4 h-4 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {isSortOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                                <button
                                    onClick={() => { onSortChange('last-scanned'); setIsSortOpen(false); }}
                                    className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between ${sortType === 'last-scanned' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    Last Scanned
                                    {sortType === 'last-scanned' && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    onClick={() => { onSortChange('alphabetical'); setIsSortOpen(false); }}
                                    className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between ${sortType === 'alphabetical' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    Alphabetical
                                    {sortType === 'alphabetical' && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Results count */}
            {(searchQuery || filterType !== 'all') && (
                <div className="mt-3 text-sm text-gray-500">
                    Showing {filteredCount} of {totalCount} sites
                </div>
            )}
        </div>
    );
}
