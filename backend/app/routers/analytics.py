from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from app.database import get_supabase
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

@router.get("/site/{site_id}/health")
async def get_site_health(site_id: str):
    """Calculate and return site health metrics"""
    try:
        supabase = get_supabase()
        
        from app.analytics_logic import calculate_site_health
        
        # 1. Fetch site stats
        pages_res = supabase.table("all_pages").select("url, status, status_code, title, meta_description, h1_tag").eq("site_id", site_id).execute()
        errors_res = supabase.table("scan_errors").select("id").eq("site_id", site_id).execute()
        
        pages = pages_res.data or []
        error_count = len(errors_res.data or [])
        
        # 2. Use shared logic
        health_data = calculate_site_health(pages, error_count)
        
        return {
            "score": health_data["score"],
            "status": health_data["status"],
            "total_pages": health_data["metrics"]["total_pages"],
            "total_errors": health_data["metrics"]["total_errors"],
            "metrics": health_data["metrics"],
            "history": supabase.table("health_history").select("score, created_at").eq("site_id", site_id).order("created_at", desc=False).limit(30).execute().data or []
        }
    except Exception as e:
        logger.error(f"Analytics Error for {site_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/site/{site_id}/report")
async def get_site_report(site_id: str):
    """Generate a comprehensive SEO report for a site"""
    try:
        supabase = get_supabase()
        from app.analytics_logic import calculate_site_health
        
        # 1. Fetch all data
        pages_res = supabase.table("all_pages").select("url, title, status_code, meta_description, h1_tag").eq("site_id", site_id).execute()
        errors_res = supabase.table("scan_errors").select("source_url, broken_url").eq("site_id", site_id).execute()
        
        pages = pages_res.data or []
        errors = errors_res.data or []
        
        # 2. Calculate current health
        health = calculate_site_health(pages, len(errors))
        
        # 3. Format as a structured report
        report = {
            "site_id": site_id,
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "score": health["score"],
                "status": health["status"],
                "total_pages": health["metrics"]["total_pages"],
                "broken_links": health["metrics"]["total_errors"]
            },
            "issues": {
                "critical": [e["broken_url"] for e in errors[:10]],
                "metadata": {
                    "missing_titles": [p["url"] for p in pages if not p.get("title")][:10],
                    "missing_descriptions": [p["url"] for p in pages if not p.get("meta_description")][:10],
                    "missing_h1s": [p["url"] for p in pages if not p.get("h1_tag")][:10]
                }
            },
            "recommendations": [
                "Fix all broken links immediately to improve user experience and SEO ranking.",
                "Ensure every page has a unique Title and Meta Description.",
                "Verify H1 tag distribution - exactly one per page is best practice."
            ]
        }
        
        return report

    except Exception as e:
        logger.error(f"Report Error for {site_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
