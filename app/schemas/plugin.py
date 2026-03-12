"""
Plugin schemas
"""

from pydantic import BaseModel
from typing import Optional, List, Dict


class VerifyConnectionRequest(BaseModel):
    api_key: str
    site_url: str
    active_plugins: Optional[List[str]] = []


class VerifyConnectionResponse(BaseModel):
    success: bool
    site_id: Optional[str] = None
    site_name: Optional[str] = None
    status: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None
    code: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "site_id": "site_1234567890ab",
                "site_name": "My WordPress Site",
                "status": "connected",
                "message": "Connection verified successfully!"
            }
        }


class PageItem(BaseModel):
    """Single page/post from WordPress"""

    url: str
    title: str
    type: str  # 'post' or 'page'


class SyncAllPagesRequest(BaseModel):
    site_url: str
    pages: List[PageItem]
    active_plugins: Optional[List[str]] = []


class SyncAllPagesResponse(BaseModel):
    success: bool
    synced_count: int = 0
    message: Optional[str] = None
    error: Optional[str] = None


# =====================
# Redirect Sync Schemas (Plugin pulls approved redirects)
# =====================

class RedirectItem(BaseModel):
    """A single redirect for the plugin to apply"""
    id: str  # suggestion ID from backend
    source_url: str  # broken URL (redirect FROM)
    target_url: str  # redirect TO
    redirect_type: int = 301  # 301 or 302
    status: str  # "approved" or "reverted"
    action: str = "redirect"  # "redirect" or "unlink"
    source_page_url: Optional[str] = None
    anchor_text: Optional[str] = None
    original_html: Optional[str] = None  # For unlink reverts: original <a> tag HTML


class GetApprovedRedirectsResponse(BaseModel):
    """Response when plugin fetches redirects to apply/revert"""
    success: bool
    redirects: List[RedirectItem] = []
    total: int = 0
    message: Optional[str] = None
    error: Optional[str] = None


class UnlinkBackupItem(BaseModel):
    """Plugin sends back the original <a> tag HTML after unlinking"""
    id: str  # suggestion ID
    original_html: str  # e.g. '<a href="https://broken.com">Click here</a>'


class MarkAppliedRequest(BaseModel):
    """Plugin confirms which redirects it has applied/reverted"""
    applied_ids: List[str] = []  # IDs successfully applied
    reverted_ids: List[str] = []  # IDs successfully reverted
    failed_items: List[Dict[str, str]] = []  # List of {id: "suggestion_id", reason: "error message"}
    unlink_backups: List[UnlinkBackupItem] = []  # Original HTML backups from unlink operations


class MarkAppliedResponse(BaseModel):
    success: bool
    applied_count: int = 0
    reverted_count: int = 0
    message: Optional[str] = None
    error: Optional[str] = None
