from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
import logging

from app.database import get_supabase
from app.middleware import get_site_from_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])

class NotificationResponse(BaseModel):
    id: str
    type: str
    message: str
    is_read: bool
    created_at: str

class GetNotificationsResponse(BaseModel):
    success: bool
    notifications: List[NotificationResponse]
    unread_count: int
    message: Optional[str] = None

@router.get("", response_model=GetNotificationsResponse, summary="Get Site Notifications")
def get_notifications(site: dict = Depends(get_site_from_api_key)):
    """
    Fetch all notifications for the given site.
    """
    try:
        supabase = get_supabase()
        site_id = site["site_id"]
        
        response = (
            supabase.table("notifications")
            .select("*")
            .eq("site_id", site_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        
        notifications = []
        unread_count = 0
        
        for n in response.data or []:
            notifications.append(
                NotificationResponse(
                    id=n.get("id"),
                    type=n.get("type"),
                    message=n.get("message"),
                    is_read=n.get("is_read", False),
                    created_at=n.get("created_at")
                )
            )
            if not n.get("is_read"):
                unread_count += 1
                
        return GetNotificationsResponse(
            success=True,
            notifications=notifications,
            unread_count=unread_count
        )

    except Exception as e:
        logger.error(f"[Notification API] Error fetching notifications: {e}")
        return GetNotificationsResponse(
            success=False,
            notifications=[],
            unread_count=0,
            message=str(e)
        )

@router.post("/{notification_id}/read", summary="Mark Notification as Read")
def mark_notification_read(notification_id: str, site: dict = Depends(get_site_from_api_key)):
    """
    Mark a specific notification as read.
    """
    try:
        supabase = get_supabase()
        site_id = site["site_id"]
        
        # Verify ownership
        check = supabase.table("notifications").select("id").eq("id", notification_id).eq("site_id", site_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Notification not found for this site.")

        response = (
            supabase.table("notifications")
            .update({"is_read": True})
            .eq("id", notification_id)
            .execute()
        )
        
        return {
            "success": True,
            "message": "Notification marked as read."
        }
        
    except Exception as e:
        logger.error(f"[Notification API] Error marking notification read: {e}")
        return {"success": False, "error": str(e)}
