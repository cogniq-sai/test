/**
 * Authentication API
 */
import { apiRequest } from "./config";

export interface LoginResponse {
    success: boolean;
    access_token: string;
    user: {
        id: string;
        email: string;
        name?: string;
    };
}

export interface SignupResponse {
    success: boolean;
    access_token?: string;
    user?: {
        id: string;
        email: string;
        name?: string;
    };
    message?: string;
    error?: string;
    code?: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
    return apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });
}

export async function signup(
    firstName: string,
    lastName: string,
    email: string,
    password: string
): Promise<SignupResponse> {
    return apiRequest<SignupResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email,
            password,
        }),
    });
}
