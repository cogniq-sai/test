"use client";

import React from 'react';

interface HealthPoint {
    score: number;
    created_at: string;
}

interface HealthTrendsChartProps {
    history: HealthPoint[];
}

export default function HealthTrendsChart({ history }: HealthTrendsChartProps) {
    if (!history || history.length < 2) {
        return (
            <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-200 text-center">
                <p className="text-sm text-gray-500">Not enough data to show health trends yet. Run more scans!</p>
            </div>
        );
    }

    // Sort history by date descending for the chart (right to left)
    const sortedHistory = [...history].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const scores = sortedHistory.map(h => h.score);
    const maxScore = 100;
    const padding = 10;
    const width = 400;
    const height = 100;
    
    // Calculate SVG points
    const points = scores.map((score, i) => {
        const x = (i / (scores.length - 1)) * (width - 2 * padding) + padding;
        const y = height - ((score / maxScore) * (height - 2 * padding) + padding);
        return `${x},${y}`;
    }).join(' ');

    const linePath = `M ${points}`;
    
    // Area path
    const areaPath = `${linePath} L ${(width - padding)},${height} L ${padding},${height} Z`;

    return (
        <div className="w-full bg-white rounded-2xl p-6 border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Health Score Trend</h4>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span className="text-xs text-gray-500">Past 30 Scans</span>
                </div>
            </div>
            
            <div className="relative h-[120px] w-full">
                <svg 
                    viewBox={`0 0 ${width} ${height}`} 
                    preserveAspectRatio="none"
                    className="w-full h-full"
                >
                    {/* Gradients */}
                    <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* Grid lines (horizontal) */}
                    <line x1="0" y1="0" x2={width} y2="0" stroke="#f3f4f6" strokeWidth="1" />
                    <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="#f3f4f6" strokeWidth="1" />
                    <line x1="0" y1={height} x2={width} y2={height} stroke="#f3f4f6" strokeWidth="1" />

                    {/* Area fill */}
                    <path 
                        d={areaPath} 
                        fill="url(#chartGradient)" 
                        className="transition-all duration-1000 ease-in-out"
                    />

                    {/* Line path */}
                    <path 
                        d={linePath} 
                        fill="none" 
                        stroke="#3B82F6" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        className="transition-all duration-1000 ease-in-out"
                    />

                    {/* Points */}
                    {scores.map((score, i) => {
                        const x = (i / (scores.length - 1)) * (width - 2 * padding) + padding;
                        const y = height - ((score / maxScore) * (height - 2 * padding) + padding);
                        return (
                            <circle 
                                key={i} 
                                cx={x} 
                                cy={y} 
                                r="3" 
                                fill="white" 
                                stroke="#3B82F6" 
                                strokeWidth="2" 
                                className="hover:r-4 transition-all cursor-pointer"
                            />
                        );
                    })}
                </svg>
            </div>
            
            <div className="flex justify-between mt-2 px-1">
                <span className="text-[10px] text-gray-400 font-medium">{new Date(sortedHistory[0].created_at).toLocaleDateString()}</span>
                <span className="text-[10px] text-gray-400 font-medium">{new Date(sortedHistory[sortedHistory.length-1].created_at).toLocaleDateString()}</span>
            </div>
        </div>
    );
}
