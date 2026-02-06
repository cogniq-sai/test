"use client";

interface EmptyDashboardStateProps {
    onAddSite: () => void;
}

export default function EmptyDashboardState({ onAddSite }: EmptyDashboardStateProps) {
    return (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/50 border border-white/50 p-8 sm:p-10">
            <div className="max-w-md mx-auto text-center">
                {/* Illustration */}
                <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl flex items-center justify-center">
                    <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                </div>

                {/* Floating decorative elements */}
                <div className="relative mb-5">
                    <div className="absolute -top-8 -left-4 w-3 h-3 bg-blue-400 rounded-full opacity-60 animate-float"></div>
                    <div className="absolute -top-4 right-8 w-2 h-2 bg-cyan-400 rounded-full opacity-60 animate-float-delayed"></div>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Connect Your First Site
                </h2>

                {/* Description */}
                <p className="text-gray-600 mb-6 leading-relaxed text-sm">
                    Connect your first WordPress site to start fixing broken links automatically.
                    Get an API key and paste it into the Cogniq plugin.
                </p>

                {/* CTA Button */}
                <button
                    onClick={onAddSite}
                    className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Add Your First Site
                </button>

                {/* Sub-info */}
                <p className="mt-4 text-xs text-gray-400">
                    Takes less than 2 minutes to set up
                </p>
            </div>
        </div>
    );
}
