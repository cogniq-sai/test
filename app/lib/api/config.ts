/**
 * API Configuration
 */
// Use proxy in development to avoid CORS issues
// Use Next.js rewrites for both dev and prod to avoid CORS
export const API_BASE_URL = '/api/v1';

/**
 * Standard API error
 */
export class ApiError extends Error {
    constructor(
        message: string,
        public statusCode?: number,
        public code?: string
    ) {
        super(message);
        this.name = "ApiError";
    }
}

/**
 * Make API request with error handling
 */
export async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    // Handle 204 No Content
    if (response.status === 204) {
        return {} as T;
    }

    const text = await response.text();
    let data;

    try {
        data = JSON.parse(text);
    } catch (error) {
        // Failed to parse JSON
        if (!response.ok) {
            console.error("API Error (Non-JSON):", text);
            throw new ApiError(
                `Server Error (${response.status})`,
                response.status
            );
        }
        // If 200 OK but not JSON (unexpected)
        console.error("API Error (Invalid JSON):", text);
        throw new ApiError("Invalid response from server", response.status);
    }

    if (!response.ok || (data && data.success === false)) {
        throw new ApiError(
            data.error || data.message || "Request failed",
            response.status,
            data.code
        );
    }

    return data;
}

/**
 * Make authenticated API request
 */
export async function authRequest<T>(
    endpoint: string,
    token: string,
    options: RequestInit = {}
): Promise<T> {
    return apiRequest<T>(endpoint, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
        },
    });
}
