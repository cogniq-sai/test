"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";

interface User {
    id: string;
    email: string;
    name?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    isInitializing: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const router = useRouter();

    // Effect to initialize auth state from localStorage on the client side
    // This prevents hydration mismatch because initial state is null for both SSR and CSR
    useEffect(() => {
        try {
            const storedToken = localStorage.getItem("auth_token");
            const storedUser = localStorage.getItem("auth_user");

            if (storedToken && storedUser && storedUser !== "undefined") {
                setToken(storedToken);
                try {
                    setUser(JSON.parse(storedUser));
                } catch {
                    localStorage.removeItem("auth_user");
                }
            }
        } catch (error) {
            console.error("Auth initialization error:", error);
        } finally {
            setIsInitializing(false);
        }
    }, []);

    const login = (newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem("auth_token", newToken);
        localStorage.setItem("auth_user", JSON.stringify(newUser));
        router.push("/dashboard");
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        router.push("/login");
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isLoading,
                isInitializing,
                login,
                logout,
                isAuthenticated: !!token,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
