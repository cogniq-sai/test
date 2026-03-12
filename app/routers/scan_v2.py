"""
Scan Router V2 - Scalable version with Redis + Celery
Uses distributed task queue and Redis state management
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import uuid

from app.database import get_supabase
from app.state_manager import ScanStateManager, check_redis_connection
from app.tasks.scan_tasks import run_scan_task
from app.utils import get_ist_timestamp_compact

router = APIRouter(prefix="/api/v1/scan", tags=["Scan & Analysis"])


# =====================
# Request/Response Models
# =====================

class StartScanRequest(BaseModel):
    site_id: str
    url: str
    max_pages: int = 10000


class StartScanResponse(BaseModel):
    status: str
    scan_id: str
    message: Optional[str] = None


class ScanStatusResponse(BaseModel):
    scan_id: str
    state: str
    progress: int
    pages_crawled: int
    total_pages: int
    errors_found: int
    error_message: Optional[str] = None
    created_at: str


class PauseResumeResponse(BaseModel):
    status: str
    scan_id: str
    progress: int
    pages_crawled: int
    total_pages: int
    message: str


class ScanErrorResponse(BaseModel):
    id: str
    source_url: str
    broken_url: str
    anchor_text: str
    status_code: int
    error_type: str
    created_at: str


class GetScanErrorsResponse(BaseModel):
    success: bool
    site_id: str
    total_errors: int
    errors: List[ScanErrorResponse]
    message: Optional[str] = None


# =====================
# Endpoints
# =====================

@router.post("", response_model=StartScanResponse, summary="Trigger a New Site Scan (Scalable)")
async def start_scan(request: StartScanRequest):
    """
    POST /api/v1/scan
    
    Start a new site scan - Uses Celery for distributed processing
    Scan runs on background worker, can scale horizontally
    """
    try:
        # Check Redis connection
        if not check_redis_connection():
            raise HTTPException(status_code=503, detail="Redis unavailable - system not ready")
        
        supabase = get_supabase()
        
        # Verify site exists
        site_response = supabase.table("sites").select("*").eq("site_id", request.site_id).execute()
        if not site_response.data:
            raise HTTPException(status_code=404, detail="Site not found")
        
        # Generate unique scan ID
        scan_id = f"scan_{get_ist_timestamp_compact()}_{uuid.uuid4().hex[:8]}"
        
        # Create scan in Redis
        ScanStateManager.create_scan(scan_id, request.site_id)
        
        print(f"[Scan API V2] 🟢 Scan {scan_id} queued for {request.url}")
        print(f"[Scan API V2] Site ID: {request.site_id}")
        print(f"[Scan API V2] Queue length: {ScanStateManager.get_queue_length()}")
        
        # Dispatch to Celery worker
        run_scan_task.delay(
            request.site_id,
            request.url,
            scan_id,
            request.max_pages
        )
        
        return StartScanResponse(
            status="started",
            scan_id=scan_id,
            message=f"Scan started for {request.url}. Check progress with /scan/{scan_id}/status"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        return StartScanResponse(
            status="error",
            scan_id="",
            message=str(e)
        )


@router.get("/{scan_id}/status", response_model=ScanStatusResponse, summary="Check Scan Progress (Scalable)")
async def get_scan_status(scan_id: str):
    """
    GET /api/v1/scan/{scan_id}/status
    
    Get scan status from Redis - works across all workers
    """
    scan_data = ScanStateManager.get_scan(scan_id)
    
    if not scan_data:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    return ScanStatusResponse(
        scan_id=scan_data["scan_id"],
        state=scan_data["state"],
        progress=scan_data["progress"],
        pages_crawled=scan_data["pages_crawled"],
        total_pages=scan_data["total_pages"],
        errors_found=scan_data["errors_found"],
        error_message=scan_data["error_message"],
        created_at=scan_data["created_at"]
    )


@router.delete("/{scan_id}", summary="Cancel an Active Scan (Scalable)")
async def cancel_scan(scan_id: str):
    """
    DELETE /api/v1/scan/{scan_id}
    
    Cancel a running scan
    """
    scan_data = ScanStateManager.get_scan(scan_id)
    
    if not scan_data:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Mark as cancelled in Redis
    ScanStateManager.mark_cancelled(scan_id)
    
    print(f"[Scan API V2] Cancelled scan {scan_id}")
    
    return {
        "status": "cancelled",
        "scan_id": scan_id,
        "message": "Scan cancelled successfully"
    }


@router.post("/{scan_id}/pause", response_model=PauseResumeResponse, summary="Pause an Active Scan (Scalable)")
async def pause_scan(scan_id: str):
    """
    POST /api/v1/scan/{scan_id}/pause
    
    Pause a running scan - state preserved in Redis
    """
    scan_data = ScanStateManager.get_scan(scan_id)
    
    if not scan_data:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan_data["state"] != "running":
        raise HTTPException(status_code=400, detail=f"Cannot pause scan in state: {scan_data['state']}")
    
    # Set pause flag
    ScanStateManager.set_pause_flag(scan_id, True)
    ScanStateManager.mark_paused(scan_id)
    
    print(f"[Scan API V2] Paused scan {scan_id} at {scan_data['progress']}% progress")
    
    return PauseResumeResponse(
        status="paused",
        scan_id=scan_id,
        progress=scan_data["progress"],
        pages_crawled=scan_data["pages_crawled"],
        total_pages=scan_data["total_pages"],
        message=f"Scan paused at {scan_data['progress']}% progress"
    )


@router.post("/{scan_id}/resume", response_model=PauseResumeResponse, summary="Resume a Paused Scan (Scalable)")
async def resume_scan(scan_id: str):
    """
    POST /api/v1/scan/{scan_id}/resume
    
    Resume a paused scan from where it left off
    """
    scan_data = ScanStateManager.get_scan(scan_id)
    
    if not scan_data:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan_data["state"] != "paused":
        raise HTTPException(status_code=400, detail=f"Cannot resume scan in state: {scan_data['state']}")
    
    # Clear pause flag and mark running
    ScanStateManager.set_pause_flag(scan_id, False)
    ScanStateManager.mark_running(scan_id)
    
    print(f"[Scan API V2] Resuming scan {scan_id} from {scan_data['progress']}% progress")
    
    # Get site info
    try:
        supabase = get_supabase()
        site_response = supabase.table("sites").select("site_url").eq("site_id", scan_data["site_id"]).execute()
        
        if not site_response.data:
            raise HTTPException(status_code=404, detail="Site not found")
        
        site_url = site_response.data[0]["site_url"]
        
        # Resume in Celery
        run_scan_task.delay(
            scan_data["site_id"],
            site_url,
            scan_id,
            10000,
            resume=True
        )
        
        return PauseResumeResponse(
            status="resumed",
            scan_id=scan_id,
            progress=scan_data["progress"],
            pages_crawled=scan_data["pages_crawled"],
            total_pages=scan_data["total_pages"],
            message=f"Scan resumed from {scan_data['progress']}% progress"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{site_id}/errors", response_model=GetScanErrorsResponse, summary="Fetch Detected Broken Links")
async def get_scan_errors(site_id: str):
    """
    GET /api/v1/scan/{site_id}/errors
    
    Get all broken links found for a site
    """
    try:
        supabase = get_supabase()
        
        response = (
            supabase.table("scan_errors")
            .select("*")
            .eq("site_id", site_id)
            .order("created_at", desc=True)
            .execute()
        )
        
        errors = []
        for error in response.data or []:
            errors.append(
                ScanErrorResponse(
                    id=error.get("id", ""),
                    source_url=error.get("source_url", ""),
                    broken_url=error.get("broken_url", ""),
                    anchor_text=error.get("anchor_text", ""),
                    status_code=error.get("status_code", 0),
                    error_type=error.get("error_type", "internal"),
                    created_at=error.get("created_at", "")
                )
            )
        
        return GetScanErrorsResponse(
            success=True,
            site_id=site_id,
            total_errors=len(errors),
            errors=errors,
            message=f"Found {len(errors)} broken link(s)"
        )
    
    except Exception as e:
        return GetScanErrorsResponse(
            success=False,
            site_id=site_id,
            total_errors=0,
            errors=[],
            message=str(e)
        )


@router.get("/all", summary="List All Active Scans (Scalable)")
async def get_all_active_scans():
    """
    GET /api/v1/scan/all
    
    Get status of all active scans from Redis
    """
    scans = ScanStateManager.get_all_active_scans()
    
    return {
        "active_scans": scans,
        "queue_length": ScanStateManager.get_queue_length(),
        "total_active": len(scans)
    }


@router.get("/{scan_id}/queue", summary="Get Crawl Queue State")
async def get_crawl_queue(scan_id: str, state: Optional[str] = None, limit: int = 100):
    """
    GET /api/v1/scan/{scan_id}/queue
    
    Get the crawl queue state for debugging
    """
    try:
        supabase = get_supabase()
        
        query = supabase.table("crawl_queue").select("*").eq("scan_id", scan_id)
        
        if state:
            query = query.eq("state", state)
        
        query = query.order("discovered_at", desc=False).limit(limit)
        response = query.execute()
        
        return {
            "success": True,
            "scan_id": scan_id,
            "total_urls": len(response.data) if response.data else 0,
            "urls": response.data or [],
            "filter": {"state": state, "limit": limit}
        }
    
    except Exception as e:
        return {
            "success": False,
            "scan_id": scan_id,
            "error": str(e),
            "urls": []
        }
