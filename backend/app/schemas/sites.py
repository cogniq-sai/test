"""
Site management schemas
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class AddSiteRequest(BaseModel):
    user_id: str
    site_name: str
    site_url: str


class AddSiteResponse(BaseModel):
    success: bool
    site_id: Optional[str] = None
    api_key: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None
    code: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "site_id": "site_1234567890ab",
                "api_key": "550e8400-e29b-41d4-a716-446655440000",
                "message": "Site added successfully"
            }
        }


class SiteInfo(BaseModel):
    site_id: str
    site_name: str
    site_url: str
    api_key: str
    connection_status: str
    created_at: Optional[str] = None
    last_verified_at: Optional[str] = None
    scan_status: Optional[str] = None
    last_scan_at: Optional[str] = None
    total_404s: int = 0
    total_redirects: int = 0


class GetSitesResponse(BaseModel):
    success: bool
    sites: List[SiteInfo] = []
    count: int = 0
    message: Optional[str] = None
    error: Optional[str] = None


class DeleteSiteResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None
    code: Optional[str] = None


class AllPageItem(BaseModel):
    url: str
    title: str  # MANDATORY - always provided via fallback
    status: str = 'ok'  # 'ok', 'broken', 'redirected', 'error', 'timeout'
    status_code: int = 200  # HTTP status code (200, 404, 500, etc.)
    last_updated: Optional[str] = None
    is_noindex: Optional[bool] = False


class GetAllPagesResponse(BaseModel):
    success: bool
    site_id: str
    total_pages: int
    pages: List[AllPageItem]
    error: Optional[str] = None
