"""
Sites router - Add, delete, list sites (Dashboard endpoints)
Requires JWT authentication
"""

from fastapi import APIRouter, Depends
import uuid
from datetime import datetime

from app.database import get_supabase
from app.middleware import get_current_user
from app.schemas.sites import (
    AddSiteRequest,
    AddSiteResponse,
    GetSitesResponse,
    DeleteSiteResponse,
    SiteInfo,
    GetAllPagesResponse,
)

router = APIRouter(prefix="/api/v1/sites", tags=["Sites Management"])


@router.post("/register", response_model=AddSiteResponse, summary="Register a New WordPress Site")
def register_site(request: AddSiteRequest):
    """
    Add a new WordPress site

    - Checks for duplicate site_url per user
    - Generates unique api_key and site_id
    - One API key = One site (api_key is unique in DB)
    """
    try:
        supabase = get_supabase()

        # Normalize URL
        site_url = request.site_url.rstrip("/")

        # Check if this user already added this site
        existing = (
            supabase.table("sites")
            .select("*")
            .eq("user_id", request.user_id)
            .eq("site_url", site_url)
            .execute()
        )

        if existing.data and len(existing.data) > 0:
            return AddSiteResponse(
                success=False,
                error="You have already added this site.",
                code="SITE_ALREADY_EXISTS",
            )

        # Generate unique identifiers
        api_key = str(uuid.uuid4())
        site_id = f"site_{uuid.uuid4().hex[:12]}"

        # Insert site
        supabase.table("sites").insert(
            {
                "user_id": request.user_id,
                "site_name": request.site_name,
                "site_url": site_url,
                "api_key": api_key,
                "site_id": site_id,
                "connection_status": "pending",
            }
        ).execute()

        return AddSiteResponse(
            success=True,
            site_id=site_id,
            api_key=api_key,
            message="Site added successfully. Configure the plugin with this API key.",
        )

    except Exception as e:
        return AddSiteResponse(success=False, error=str(e))


@router.get("/list/{user_id}", response_model=GetSitesResponse, summary="List All Sites for a User")
def get_user_sites(user_id: str):
    """
    Get all sites for a user

    Returns sites with their connection status
    """
    try:
        supabase = get_supabase()

        response = (
            supabase.table("sites")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )

        sites = []
        for site in response.data or []:
            sites.append(
                SiteInfo(
                    site_id=site.get("site_id", ""),
                    site_name=site.get("site_name", ""),
                    site_url=site.get("site_url", ""),
                    api_key=site.get("api_key", ""),
                    connection_status=site.get("connection_status", "pending"),
                    created_at=site.get("created_at"),
                    last_verified_at=site.get("last_verified_at"),
                    scan_status=site.get("scan_status"),
                    last_scan_at=site.get("last_scan_at"),
                    total_404s=site.get("total_404s", 0),
                    total_redirects=site.get("total_redirects", 0),
                )
            )

        return GetSitesResponse(
            success=True,
            sites=sites,
            count=len(sites),
            message=f"Found {len(sites)} site(s)." if sites else "No sites found.",
        )

    except Exception as e:
        return GetSitesResponse(success=False, error=str(e))


@router.delete("/{site_id}", response_model=DeleteSiteResponse, summary="Remove a Registered Site")
def delete_site(site_id: str):
    """
    Delete a site and all associated data

    - Removes site record
    - Cleans up scan errors and discovered pages
    """
    try:
        supabase = get_supabase()

        # Check if site exists
        existing = supabase.table("sites").select("*").eq("site_id", site_id).execute()

        if not existing.data:
            return DeleteSiteResponse(
                success=False, error="Site not found.", code="SITE_NOT_FOUND"
            )

        # Delete associated data
        try:
            supabase.table("scan_errors").delete().eq("site_id", site_id).execute()
        except:
            pass

        try:
            supabase.table("all_pages").delete().eq("site_id", site_id).execute()
        except:
            pass

        try:
            supabase.table("redirect_suggestions").delete().eq("site_id", site_id).execute()
        except:
            pass

        # Delete the site
        supabase.table("sites").delete().eq("site_id", site_id).execute()

        return DeleteSiteResponse(success=True, message="Site deleted successfully.")

    except Exception as e:
        return DeleteSiteResponse(success=False, error=str(e))


@router.get("/{site_id}/all-pages", response_model=GetAllPagesResponse, summary="Fetch All Discovered & Synced Pages for a Site")
def get_site_pages(site_id: str):
    """
    Fetch all discovered (crawled) and synced (plugin) pages for a site.
    """
    try:
        supabase = get_supabase()

        print(f"[Sites API] Fetching all pages for site: {site_id}")
        
        # First check if site exists
        site_result = supabase.table("sites").select("site_id, site_name, scan_status, last_scan_at").eq("site_id", site_id).execute()
        if not site_result.data:
            print(f"[Sites API] Site {site_id} not found")
            return GetAllPagesResponse(
                success=False, 
                site_id=site_id, 
                total_pages=0, 
                pages=[], 
                error="Site not found"
            )
        
        site_info = site_result.data[0]
        print(f"[Sites API] Site found: {site_info.get('site_name')}, scan_status: {site_info.get('scan_status')}, last_scan: {site_info.get('last_scan_at')}")
        
        # Try to fetch pages - Supabase has a hard limit of 1000 rows per request
        # We need to paginate using .range() to get ALL pages
        
        # First get total count
        count_result = supabase.table("all_pages").select("*", count="exact").eq("site_id", site_id).limit(1).execute()
        total_count = count_result.count if count_result.count else 0
        
        print(f"[Sites API] Total pages in database: {total_count}")
        
        # Fetch all pages using pagination (1000 rows per batch)
        all_pages = []
        page_size = 1000
        offset = 0
        
        while True:
            batch_result = supabase.table("all_pages").select("url, last_updated, title, status, status_code, is_noindex").eq("site_id", site_id).range(offset, offset + page_size - 1).execute()
            
            if not batch_result.data:
                break
            
            all_pages.extend(batch_result.data)
            print(f"[Sites API] Fetched batch: {len(batch_result.data)} pages (total so far: {len(all_pages)})")
            
            # If we got less than page_size, we're done
            if len(batch_result.data) < page_size:
                break
            
            offset += page_size
        
        pages = all_pages
        print(f"[Sites API] Total pages fetched: {len(pages)}")
        
        print(f"[Sites API] Found {len(pages)} pages for site {site_id}")
        
        # If no pages found, provide helpful message
        if len(pages) == 0:
            scan_status = site_info.get('scan_status', 'never')
            if scan_status == 'never':
                error_msg = "No scan has been run yet. Please start a scan first."
            elif scan_status == 'running':
                error_msg = "Scan is currently running. Pages will appear once the scan completes."
            elif scan_status == 'failed':
                error_msg = "Last scan failed. Please try running a new scan."
            else:
                error_msg = "No pages found. The scan may have discovered 0 pages or failed to save results."
            
            return GetAllPagesResponse(
                success=True, 
                site_id=site_id, 
                total_pages=0, 
                pages=[], 
                error=error_msg
            )

        return GetAllPagesResponse(
            success=True, 
            site_id=site_id, 
            total_pages=len(pages), 
            pages=pages
        )
    except Exception as e:
        print(f"[Sites API] Error fetching pages: {str(e)}")
        return GetAllPagesResponse(
            success=False, 
            site_id=site_id, 
            total_pages=0, 
            pages=[], 
            error=str(e)
        )
