"""
Pydantic schemas for redirect suggestion endpoints
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal

# ...

class GenerateRedirectsRequest(BaseModel):
    """Request to generate AI redirect suggestions"""
    site_id: str = Field(..., description="Site ID to generate suggestions for")
    scan_id: Optional[str] = Field(None, description="Optional scan ID to process specific scan results")


class SelectRedirectRequest(BaseModel):
    """Request to select a redirect option"""
    selected_option: Literal['primary', 'alternative', 'custom', 'rejected', 'unlinked'] = Field(..., description="Which option: 'primary', 'alternative', 'custom', 'rejected', or 'unlinked'")
    custom_redirect_url: Optional[str] = Field(None, description="Custom URL if selected_option is 'custom'")


class ApplyRedirectsRequest(BaseModel):
    """Request to mark redirects as applied"""
    suggestion_ids: List[str] = Field(..., description="List of suggestion IDs to mark as applied")


# =====================
# Response Models
# =====================

class RedirectSuggestionDetail(BaseModel):
    """Details of a single redirect option (primary or alternative)"""
    target_url: str
    confidence: int = Field(..., ge=0, le=100, description="Confidence score 0-100")
    reasoning: str
    redirect_type: str = Field(..., description="301 or 302")


class RedirectSuggestionResponse(BaseModel):
    """Complete redirect suggestion with primary and alternative options"""
    id: str
    site_id: str
    broken_url: str
    source_url: str
    anchor_text: str
    
    # Primary suggestion
    primary_url: str
    primary_confidence: int
    primary_reason: str
    primary_redirect_type: str
    
    # Alternative suggestion
    alternative_url: Optional[str] = None
    alternative_confidence: Optional[int] = None
    alternative_reason: Optional[str] = None
    alternative_redirect_type: Optional[str] = None
    
    # User decision
    selected_option: Optional[str] = None
    custom_redirect_url: Optional[str] = None
    status: str
    
    # Timestamps
    created_at: str
    updated_at: str
    applied_at: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "site_id": "site_123",
                "broken_url": "https://example.com/old-page",
                "source_url": "https://example.com/blog",
                "anchor_text": "Read more about SEO",
                "primary_url": "https://example.com/seo-guide",
                "primary_confidence": 85,
                "primary_reason": "Strong semantic match with anchor text and URL structure",
                "primary_redirect_type": "301",
                "alternative_url": "https://example.com/blog/seo-tips",
                "alternative_confidence": 70,
                "alternative_reason": "Related topic with similar content",
                "alternative_redirect_type": "301",
                "selected_option": None,
                "custom_redirect_url": None,
                "status": "pending",
                "created_at": "2026-02-10T10:00:00Z",
                "updated_at": "2026-02-10T10:00:00Z",
                "applied_at": None
            }
        }


class GetSuggestionsResponse(BaseModel):
    """Response with list of redirect suggestions"""
    success: bool
    site_id: str
    total: int
    suggestions: List[RedirectSuggestionResponse]
    message: Optional[str] = None


class GenerateRedirectsResponse(BaseModel):
    """Response after triggering redirect generation"""
    success: bool
    message: str
    total_broken_links: int
    suggestions_generated: int


class SelectRedirectResponse(BaseModel):
    """Response after selecting a redirect option"""
    success: bool
    suggestion_id: str
    selected_option: Optional[str] = None
    status: str
    message: str


class ApplyRedirectsResponse(BaseModel):
    """Response after applying redirects"""
    success: bool
    applied_count: int
    message: str
