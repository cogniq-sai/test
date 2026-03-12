"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    toasts: Toast[];
    showToast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = "info") => {
        const id = Math.random().toString(36).slice(2);
        setToasts((prev) => [...prev, { id, message, type }]);

        // Auto remove after 4 seconds
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const success = useCallback((message: string) => showToast(message, "success"), [showToast]);
    const error = useCallback((message: string) => showToast(message, "error"), [showToast]);
    const info = useCallback((message: string) => showToast(message, "info"), [showToast]);

    return (
        <ToastContext.Provider value={{ toasts, showToast, success, error, info }}>
            {children}
            <ToastContainer toasts={toasts} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within ToastProvider");
    }
    return context;
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-slide-up ${toast.type === "success"
                            ? "bg-green-500 text-white"
                            : toast.type === "error"
                                ? "bg-red-500 text-white"
                                : "bg-gray-800 text-white"
                        }`}
                >
                    {toast.message}
                </div>
            ))}
        </div>
    );
}
