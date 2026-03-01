"use client";

import Link from "next/link";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
    const { isAuthenticated, isInitializing } = useAuth();

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
            <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

                {/* Logo / Brand */}
                <Link href="/" className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5" />
                        </svg>
                    </div>
                    <span className="text-xl font-bold text-gray-900">
                        AutoRankr <span className="text-blue-600">AI</span>
                    </span>
                </Link>

                {/* Actions */}
                <nav className="flex items-center gap-3">
                    {!isInitializing && isAuthenticated ? (
                        <Link
                            href="/dashboard"
                            className="px-6 py-2.5 text-sm font-bold bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-full shadow-lg shadow-blue-500/25 hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Go to Dashboard
                        </Link>
                    ) : (
                        <>
                            <Link
                                href="/login"
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                Login
                            </Link>

                            <Link
                                href="/login?mode=signup"
                                className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-full shadow-lg shadow-blue-500/25 hover:opacity-90 transition-all"
                            >
                                Get Started Free
                            </Link>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
};

export default Navbar;
