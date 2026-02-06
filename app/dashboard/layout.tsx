"use client";

import { DashboardProvider } from "../context/DashboardContext";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <DashboardProvider>
            {children}
        </DashboardProvider>
    );
}
