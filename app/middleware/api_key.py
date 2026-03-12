"""
API Key Authentication middleware for Plugin requests

Security:
- Plugin sends X-API-Key header
- Plugin sends X-Site-URL header for double validation
- API key must exist in sites table
- API key must match the registered site_url
- One API key = One site (enforced by DB unique constraint)
"""
from fastapi import HTTPException, Header, Depends
from typing import Optional
from app.database import get_supabase


async def get_site_from_api_key(
    x_api_key: str = Header(..., description="Plugin API Key"),
    x_site_url: Optional[str] = Header(None, description="Site URL for validation")
) -> dict:
    """
    Dependency to validate API key and return site info.
    
    Returns:
        dict with site_id, site_url, site_name, user_id
    
    Raises:
        HTTPException 401 if invalid
    """
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    
    supabase = get_supabase()
    
    # Look up API key
    response = supabase.table("sites").select("*").eq("api_key", x_api_key).execute()
    
    if not response.data or len(response.data) == 0:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    site = response.data[0]
    
    # If X-Site-URL provided, validate it matches
    if x_site_url:
        # Normalize URLs for comparison (remove trailing slash)
        registered_url = site.get("site_url", "").rstrip("/")
        provided_url = x_site_url.rstrip("/")
        
        if registered_url.lower() != provided_url.lower():
            raise HTTPException(
                status_code=401, 
                detail="API key does not match this site URL"
            )
    
    return {
        "site_id": site.get("site_id"),
        "site_url": site.get("site_url"),
        "site_name": site.get("site_name"),
        "user_id": site.get("user_id"),
        "connection_status": site.get("connection_status")
    }


async def verify_api_key(site: dict = Depends(get_site_from_api_key)) -> dict:
    """Simple dependency that just validates API key exists"""
    return site
