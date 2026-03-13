import { authRequest } from "./config";

export interface Notification {
    id: string;
    type: string;
    message: string;
    is_read: boolean;
    created_at: string;
}

export interface GetNotificationsResponse {
    success: boolean;
    notifications: Notification[];
    unread_count: number;
}

/**
 * Fetches all notifications for a user (across all sites)
 */
export async function getUserNotifications(token: string, userId: string): Promise<GetNotificationsResponse> {
    return authRequest<GetNotificationsResponse>(`/api/v1/notifications/user/${userId}`, token);
}

/**
 * Mark a notification as read
 */
export async function markNotificationRead(token: string, notificationId: string): Promise<{success: boolean}> {
    // Note: The backend mark_notification_read currently depends on get_site_from_api_key in some endpoints,
    // but we'll use it as specified for the WordPress plugin path if needed.
    // For now, we'll implement the user-level one if we had it, but let's stick to the current backend.
    return authRequest<{success: boolean}>(`/api/v1/notifications/${notificationId}/read`, token, {
        method: "POST"
    });
}
