from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx
import xml.etree.ElementTree as ET
from app.database import get_supabase
from app.middleware import get_site_from_api_key, get_current_user
from app.utils import get_ist_now_iso
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/sitemap", tags=["Sitemap Generation"])

class GenerateSitemapResponse(BaseModel):
    success: bool
    xml_content: Optional[str] = None
    page_count: int = 0
    message: str
    error: Optional[str] = None

class ApproveSitemapRequest(BaseModel):
    action: str # 'approve', 'reject', or 'pending'
    siteId: str

@router.get("/generate", response_model=GenerateSitemapResponse, summary="Fetch Approved XML Sitemap")
def fetch_approved_sitemap(site: dict = Depends(get_site_from_api_key)):
    """
    Plugin requests the approved XML sitemap.
    Fetches the most recent 'approved' sitemap from sitemap_suggestions.
    """
    try:
        supabase = get_supabase()
        site_id = site["site_id"]
        
        # Fetch the most recent approved sitemap
        response = (
            supabase.table("sitemap_suggestions")
            .select("suggested_xml_content, total_urls")
            .eq("site_id", site_id)
            .eq("approval_status", "approved")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        
        if not response.data:
            return GenerateSitemapResponse(
                success=False, # Important: False so WP doesn't overwrite
                xml_content="", 
                page_count=0, 
                message="No approved sitemap available for this site."
            )

        sitemap_data = response.data[0]
        xmlstr = sitemap_data.get("suggested_xml_content", "")
        page_count = sitemap_data.get("total_urls", 0)

        return GenerateSitemapResponse(
            success=True,
            xml_content=xmlstr,
            page_count=page_count,
            message="Approved sitemap fetched successfully."
        )

    except Exception as e:
        logger.error(f"[Sitemap API] Error generating sitemap: {e}")
        return GenerateSitemapResponse(
            success=False,
            message="Failed to generate sitemap",
            error=str(e)
        )

@router.get("/check-plugins", summary="Check for Active SEO Plugins")
def check_plugins(siteId: str):
    """
    Check if the site has active SEO plugins that would conflict with our sitemap.
    If plugins exist, it triggers a notification and returns true.
    """
    try:
        supabase = get_supabase()
        site_id = siteId
        
        # 1. Fetch site info (URL and API Key to communicate with WP)
        site_info = supabase.table("sites").select("active_seo_plugins, site_url, api_key, connection_status").eq("site_id", site_id).execute()
        
        if not site_info.data:
             return {"success": False, "error": "Site not found"}
            
        site_data = site_info.data[0]
        
        # 2. Try to fetch live status from the WP Plugin
        active_plugins = site_data.get("active_seo_plugins") or []
        
        if site_data.get("connection_status") == "connected" and site_data.get("site_url") and site_data.get("api_key"):
            try:
                wp_url = site_data["site_url"].rstrip("/")
                response = httpx.get(
                    f"{wp_url}/wp-json/aiseo/v1/status",
                    headers={"X-API-Key": site_data["api_key"]},
                    timeout=10.0
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        active_plugins = data.get("active_plugins", [])
                        # Real-time update in db
                        supabase.table("sites").update({
                            "active_seo_plugins": active_plugins
                        }).eq("site_id", site_id).execute()
            except Exception as e:
                logger.warning(f"Failed to fetch live plugin status from {wp_url}: {e}")
                # Fallback to database value if the ping fails
                pass 
            
        if active_plugins:
            return {
                "success": True,
                "plugins_detected": True,
                "plugins": active_plugins,
                "message": f"Plugins detected: {', '.join(active_plugins)}. You must remove or disable them before generating a sitemap, or explicitly approve overriding them."
            }
            
        return {
            "success": True,
            "plugins_detected": False,
            "plugins": [],
            "message": "No conflicting SEO plugins detected. Safe to generate sitemap."
        }

    except Exception as e:
        logger.error(f"[Sitemap API] Error checking plugins: {e}")
        return {"success": False, "error": str(e)}

class GenerateSitemapRequest(BaseModel):
    siteId: str

@router.post("/generate-suggestion", summary="Generate a Sitemap Suggestion")
def generate_sitemap_suggestion(request: GenerateSitemapRequest, current_user: dict = Depends(get_current_user)):
    """
    Generates a new sitemap suggestion based on the latest crawl data (`all_pages`).
    Status defaults to 'pending' to enforce Human-in-the-Loop approval.
    """
    try:
        supabase = get_supabase()
        site_id = request.siteId
        
        # Security Check: Ensure no conflicting SEO plugins are active
        site_info = supabase.table("sites").select("active_seo_plugins").eq("site_id", site_id).execute()
        if site_info.data and site_info.data[0].get("active_seo_plugins"):
            active_plugins = site_info.data[0]["active_seo_plugins"]
            if active_plugins and len(active_plugins) > 0:
                return {
                    "success": False, 
                    "message": f"Cannot generate sitemap. Conflicting SEO plugins detected: {', '.join(active_plugins)}"
                }
        
        # Fetch all OK pages that are not noindexed
        pages_response = supabase.table("all_pages").select("url, status_code, is_noindex").eq("site_id", site_id).eq("status_code", 200).eq("is_noindex", False).execute()
        pages_data = pages_response.data or []
        
        if not pages_data:
            return {"success": False, "message": "No valid crawled pages found to generate a sitemap."}

        # Build XML
        lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for p in pages_data:
            lines.append(f'<url><loc>{p["url"]}</loc></url>')
        lines.append('</urlset>')
        xmlstr = '\n'.join(lines)
        
        # Clean up old suggestions
        supabase.table("sitemap_suggestions").delete().eq("site_id", site_id).execute()
        
        # Insert new pending suggestion
        supabase.table("sitemap_suggestions").insert({
            "site_id": site_id,
            "approval_status": "pending",
            "suggested_xml_content": xmlstr,
            "total_urls": len(pages_data)
        }).execute()
        
        return {
            "success": True, 
            "message": "Sitemap suggestion successfully generated and is pending approval.",
            "total_urls": len(pages_data),
            "urls": [p["url"] for p in pages_data]
        }

    except Exception as e:
        logger.error(f"[Sitemap API] Error generating sitemap suggestion: {e}")
        return {"success": False, "error": str(e)}

@router.get("/suggestions", summary="Get Sitemap Suggestions for Dashboard")
def get_sitemap_suggestions(siteId: str):
    """
    Frontend requests the list of sitemap suggestions (pending, approved, rejected).
    """
    try:
        supabase = get_supabase()
        
        response = (
            supabase.table("sitemap_suggestions")
            .select("id, approval_status, total_urls, created_at, reviewed_at")
            .eq("site_id", siteId)
            .order("created_at", desc=True)
            .execute()
        )
        
        return {
            "success": True,
            "suggestions": response.data or []
        }
    except Exception as e:
        logger.error(f"[Sitemap API] Error fetching suggestions: {e}")
        return {"success": False, "error": str(e)}

@router.get("/issues", summary="Get Broken Links and NoIndex Pages for Sitemap")
def get_sitemap_issues(siteId: str):
    """
    Returns broken links (4xx status) and noindex pages from the crawl.
    These are the URLs excluded from the optimized sitemap.
    """
    try:
        supabase = get_supabase()

        # Broken links: pages with status_code >= 400
        broken_response = (
            supabase.table("all_pages")
            .select("url, status_code, title")
            .eq("site_id", siteId)
            .gte("status_code", 400)
            .order("status_code", desc=False)
            .execute()
        )

        # NoIndex pages: status 200 but marked noindex
        noindex_response = (
            supabase.table("all_pages")
            .select("url, title")
            .eq("site_id", siteId)
            .eq("is_noindex", True)
            .execute()
        )

        return {
            "success": True,
            "broken_links": broken_response.data or [],
            "noindex_links": noindex_response.data or []
        }

    except Exception as e:
        logger.error(f"[Sitemap API] Error fetching sitemap issues: {e}")
        return {"success": False, "error": str(e)}


@router.post("/suggestions/{suggestion_id}/status", summary="Approve or Reject Sitemap Suggestion")
def update_sitemap_status(
    suggestion_id: str, 
    request: ApproveSitemapRequest
):
    """
    Frontend approves or rejects a sitemap suggestion.
    """
    try:
        if request.action not in ["approve", "reject", "pending"]:
            raise HTTPException(status_code=400, detail="Invalid action. Use approve, reject, or pending.")

        supabase = get_supabase()
        site_id = request.siteId
        
        from app.utils import get_ist_now_iso

        # Verify ownership
        check = supabase.table("sitemap_suggestions").select("id").eq("id", suggestion_id).eq("site_id", site_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Suggestion not found for this site.")

        status = "approved" if request.action == "approve" else "rejected" if request.action == "reject" else "pending"

        response = (
            supabase.table("sitemap_suggestions")
            .update({
                "approval_status": status,
                "reviewed_at": get_ist_now_iso()
            })
            .eq("id", suggestion_id)
            .execute()
        )
        
        return {
            "success": True,
            "message": f"Sitemap successfully marked as {status}.",
            "data": response.data[0] if response.data else None
        }
    except Exception as e:
        logger.error(f"[Sitemap API] Error updating status: {e}")
        return {"success": False, "error": str(e)}
