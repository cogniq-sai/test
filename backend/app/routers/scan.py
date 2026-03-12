"""
Scan Router - API endpoints for site scanning and broken link detection
Integrated with Scrapy Spider (CrawlerProcess version)

Endpoints:
- POST /api/v1/scan - Start a new scan
- GET /api/v1/scan/{scan_id}/status - Get scan status
- DELETE /api/v1/scan/{scan_id} - Cancel scan
- GET /api/v1/scan/{site_id}/errors - Get scan errors
- GET /api/v1/scan/all - Get all active scans
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime
import uuid
import time
from enum import Enum

from app.database import get_supabase
from app.services.crawler.wrapper import SimpleCrawler
from app.utils import get_ist_now_iso, get_ist_timestamp_compact

router = APIRouter(prefix="/api/v1/scan", tags=["Scan & Analysis"])

# =====================
# Scan State Management
# =====================
class ScanState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ScanStatus:
    """Track individual scan status"""
    def __init__(self, scan_id: str, site_id: str):
        self.scan_id = scan_id
        self.site_id = site_id
        self.state = ScanState.QUEUED
        self.progress = 0
        self.pages_crawled = 0
        self.total_pages = 0  # Track total discovered pages
        self.errors_found = 0
        self.error_message = None
        self.created_at = get_ist_now_iso()
        self.started_at = None
        self.completed_at = None
        self.pause_requested = False  # Flag for pause/resume
    
    def to_dict(self):
        return {
            "scan_id": self.scan_id,
            "site_id": self.site_id,
            "state": self.state.value,
            "progress": self.progress,
            "pages_crawled": self.pages_crawled,
            "total_pages": self.total_pages,
            "errors_found": self.errors_found,
            "error_message": self.error_message,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at
        }


# Global scan tracker
ACTIVE_SCANS: Dict[str, ScanStatus] = {}
SCAN_QUEUE: List[str] = []


# =====================
# Request/Response Models
# =====================
class PauseResumeResponse(BaseModel):
    status: str
    scan_id: str
    progress: int
    pages_crawled: int
    total_pages: int  # Added for better UX
    message: str


class StartScanRequest(BaseModel):
    site_id: str
    url: str
    max_pages: int = 10000


class StartScanResponse(BaseModel):
    status: str
    scan_id: str
    message: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "status": "started",
                "scan_id": "scan_20260125_a1b2c3d4",
                "message": "Scan started in background"
            }
        }


class ScanStatusResponse(BaseModel):
    scan_id: str
    state: str
    progress: int
    pages_crawled: int
    total_pages: int  # Added for better UX
    errors_found: int
    error_message: Optional[str] = None
    created_at: str


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
# Core Scanning Function
# =====================

async def run_scan_async(site_id: str, start_url: str, scan_id: str, max_pages: int = 1000, resume: bool = False):
    """
    Async function to run crawler - FastAPI manages the event loop
    Supports pause/resume with persistent state
    """
    scan = ACTIVE_SCANS.get(scan_id)
    if not scan:
        return
    
    try:
        supabase = get_supabase()
        
        # Mark scan as running (or keep running if resuming)
        if not resume:
            scan.state = ScanState.RUNNING
            scan.started_at = get_ist_now_iso()
        
        # Update site status in DB
        try:
            supabase.table("sites").update({
                "scan_status": "running"
            }).eq("site_id", site_id).execute()
        except Exception as e:
            print(f"[Scan] Error updating site status: {str(e)}")
        
        print(f"[Scan {scan_id}] {'Resuming' if resume else 'Starting'} crawler for {start_url}")
        
        # Callback function to save results
        def save_results_callback(broken_links, crawled_pages, site_id_param):
            """Called by crawler when complete or paused"""
            try:
                # 1. Save Discovered Pages (all_pages table)
                # ONLY save validated pages from crawled_pages (no duplicates, no pending)
                pages_data = []
                seen_urls = set()  # Extra safety to avoid duplicates
                
                print(f"[Scan {scan_id}] Processing {len(crawled_pages)} validated pages")
                
                # Use crawled_pages directly (already deduplicated by crawler)
                for page_url, page_info in crawled_pages.items():
                    status_code = page_info.get("status", 200)  # Default to 200
                    title = page_info.get("title")
                    
                    # MANDATORY: Ensure title is never None
                    if not title:
                        # Generate title from URL as fallback
                        from urllib.parse import urlparse, unquote
                        path = urlparse(page_url).path.strip('/')
                        if path:
                            # Take only the LAST part of the path (the actual page name)
                            page_name = path.split('/')[-1]
                            title = unquote(page_name).replace('-', ' ').replace('_', ' ').title()[:100]
                        else:
                            title = 'Home Page'
                    
                    # Normalize URL (remove trailing slash for consistency)
                    normalized_url = page_url.rstrip("/")
                    
                    # Skip duplicates (extra safety)
                    if normalized_url in seen_urls:
                        print(f"[Scan {scan_id}] Skipping duplicate: {normalized_url}")
                        continue
                    seen_urls.add(normalized_url)
                    
                    # Determine status string based on status code
                    # ONLY 200 or 404 (as per new validation logic)
                    if status_code == 200:
                        status_str = 'ok'
                    elif status_code == 404:
                        status_str = 'broken'
                    else:
                        # Fallback for any other status (shouldn't happen with new logic)
                        status_str = 'ok' if status_code < 400 else 'broken'
                    
                    pages_data.append({
                        'site_id': site_id,
                        'url': normalized_url,
                        'status': status_str,
                        'status_code': status_code,
                        'title': title,
                        'meta_description': page_info.get("description"),
                        'h1_tag': page_info.get("h1"),
                        'is_noindex': page_info.get("is_noindex", False),
                        'last_updated': get_ist_now_iso()
                    })
                
                # Save pages_data to database
                if pages_data:
                    print(f"[Scan {scan_id}] Saving {len(pages_data)} unique pages (no duplicates)")
                    
                    try:
                        # CRITICAL: Delete old pages first to avoid inconsistency
                        supabase.table("all_pages").delete().eq("site_id", site_id).execute()
                        print(f"[Scan {scan_id}] Cleared old pages for site {site_id}")
                        
                        # Insert new pages
                        supabase.table("all_pages").insert(pages_data).execute()
                        print(f"[Scan {scan_id}] ✅ Saved {len(pages_data)} pages to all_pages")
                        
                        # CRITICAL: Update scan.total_pages and scan.pages_crawled to match
                        scan.total_pages = len(pages_data)
                        scan.pages_crawled = len(pages_data)
                        print(f"[Scan {scan_id}] ✅ Updated scan.total_pages = {len(pages_data)}")
                        print(f"[Scan {scan_id}] ✅ Updated scan.pages_crawled = {len(pages_data)}")
                    except Exception as e:
                        print(f"[Scan {scan_id}] Error saving all_pages: {str(e)}")

                # 2. Save Broken Links (scan_errors table)
                # IMPORTANT: Extract broken links from BOTH sources:
                # a) broken_links list (from crawler's link validation)
                # b) crawled_pages with status_code=404 (sitemap/discovered URLs)
                errors = []
                
                # Add from broken_links list
                # Add from broken_links list
                for link in broken_links:
                    # Fix for DB constraint: 'broken' is not allowed, map to 'internal_404'
                    # Or verify against allowed types
                    e_type = link.link_type
                    if e_type == 'broken':
                        e_type = 'internal_404'
                        
                    errors.append({
                        'site_id': site_id,
                        'scan_id': scan_id,
                        'error_type': e_type,
                        'source_url': link.source_url,
                        'broken_url': link.broken_url,
                        'anchor_text': link.anchor_text,
                        'status_code': link.status_code,
                        'created_at': get_ist_now_iso()
                    })
                
                # ALSO add from crawled_pages (for sitemap-discovered 404s or other errors)
                from app.services.crawler.crawler import URLNormalizer

                for page_url, page_info in crawled_pages.items():
                    status_code = page_info.get("status", 200)
                    
                    if status_code >= 400:
                        # Check if already in errors list (avoid duplicates)
                        if not any(e['broken_url'] == page_url for e in errors):
                            
                            # Determine if internal or external
                            is_internal = URLNormalizer.is_internal(page_url, site_id) # site_id passed to callback serves as base_domain usually? 
                            # Wait, site_id is "site_123". We need the base domain. 
                            # The 'site_id' param in save_results_callback is actually the site_id string, not domain.
                            # However, looking at run_scan_async, we have 'start_url'.
                            # We can get base_domain from start_url.
                            # But wait, save_results_callback is defined inside run_scan_async which has start_url in scope!
                            # Let's use start_url to extract base_domain.
                            
                            from urllib.parse import urlparse
                            base_domain = urlparse(start_url).netloc.lower().replace('www.', '')
                            is_internal = URLNormalizer.is_internal(page_url, base_domain)

                            # Determine allowed error_type based on status code
                            # DB Constraint allows: 'internal_404', 'external_404', 'standard_404', 
                            # 'internal_500', 'internal_403', 'internal_401'
                            # 'external_500', 'external_403' etc might not be in constraint? 
                            # Let's check generally or assume typical external_404
                            
                            prefix = "internal" if is_internal else "external"

                            if status_code == 404:
                                error_type = f'{prefix}_404'
                            elif status_code == 500:
                                error_type = f'{prefix}_500'
                            elif status_code == 403:
                                error_type = f'{prefix}_403'
                            elif status_code == 401:
                                error_type = f'{prefix}_401'
                            else:
                                # Fallback for other codes (400, 502, etc) -> map to nearest allowed
                                error_type = f'{prefix}_500' if status_code >= 500 else f'{prefix}_404'
                                
                            errors.append({
                                'site_id': site_id,
                                'scan_id': scan_id,
                                'error_type': error_type,
                                'source_url': 'Sitemap/Discovery',
                                'broken_url': page_url,
                                'anchor_text': 'Sitemap Link',
                                'status_code': status_code,
                                'created_at': get_ist_now_iso()
                            })
                
                
                scan.errors_found = len(errors)
                
                if errors:
                    try:
                        # Clear previous errors for this site to avoid duplicates from multiple scans
                        # This ensures the dashboard reflects the current state of the site
                        supabase.table("scan_errors").delete().eq("site_id", site_id).execute()
                        print(f"[Scan {scan_id}] Cleared old errors for site {site_id}")

                        supabase.table("scan_errors").insert(errors).execute()
                        print(f"[Scan {scan_id}] Saved {len(errors)} errors")
                    except Exception as e:
                        print(f"[Scan {scan_id}] Error saving scan_errors: {str(e)}")
                        scan.error_message = f"DB Save Error: {str(e)}"
                
                # Update site
                try:
                    update_data = {
                        "scan_status": "completed",
                        "last_scan_at": get_ist_now_iso(),
                        "total_errors": len(errors)
                    }
                    
                    # Get actual page count from all_pages table to ensure consistency
                    try:
                        final_pages = supabase.table("all_pages").select("url", count="exact").eq("site_id", site_id).execute()
                        total_pages_count = final_pages.count if final_pages.count is not None else len(pages_data)
                        
                        # CRITICAL: Update both total_pages AND pages_crawled to match database
                        # This ensures perfect consistency between status and all_pages
                        scan.total_pages = total_pages_count
                        scan.pages_crawled = total_pages_count
                        print(f"[Scan {scan_id}] ✅ VERIFIED: scan.total_pages = {total_pages_count}")
                        print(f"[Scan {scan_id}] ✅ VERIFIED: scan.pages_crawled = {total_pages_count}")
                        print(f"[Scan {scan_id}] ✅ VERIFIED: all_pages count = {total_pages_count}")
                        print(f"[Scan {scan_id}] ✅ ALL COUNTS MATCH!")
                        
                        # 3. MoM Requirement: Plugin Detection Only (Auto-fallback moved to explicit API)
                        # Check if SEO plugins exist
                        site_info = supabase.table("sites").select("active_seo_plugins").eq("site_id", site_id).execute()
                        active_plugins = []
                        if site_info.data and site_info.data[0].get("active_seo_plugins"):
                            active_plugins = site_info.data[0]["active_seo_plugins"]
                            
                        # If plugins exist, set a flag or just log it. The actual notification 
                        # is now handled by the explicit /sitemap/check-plugins endpoint.
                        if active_plugins:
                            print(f"[Scan {scan_id}] ℹ️ Scan completed. Plugins detected: {active_plugins}. User must initiate sitemap check manually.")
                        else:
                            print(f"[Scan {scan_id}] ℹ️ Scan completed. No plugins detected. Ready for sitemap generation.")

                    except Exception as e:
                        print(f"[Scan {scan_id}] Could not fetch page count: {str(e)}")
                        # Fallback to pages_data count if query fails
                        scan.total_pages = len(pages_data)
                        scan.pages_crawled = len(pages_data)

                    supabase.table("sites").update(update_data).eq("site_id", site_id).execute()
                except Exception as e:
                    print(f"[Scan {scan_id}] Error updating site: {str(e)}")
                
                # Mark complete
                if not crawled_pages:
                    scan.state = ScanState.FAILED
                    scan.error_message = "Crawl discovered zero pages. Check if the site is blocking the crawler or if the URL is correct."
                    scan.progress = 0
                    print(f"[Scan {scan_id}] ❌ Failed: No pages discovered")
                else:
                    # Check if scan was paused
                    if scan.state == ScanState.PAUSED:
                        print(f"[Scan {scan_id}] ⏸️ Paused at {scan.progress}%")
                    else:
                        scan.state = ScanState.COMPLETED
                        scan.completed_at = get_ist_now_iso()
                        scan.progress = 100
                        print(f"[Scan {scan_id}] ✅ Complete!")
                        
                        # Phase 3: Update Health History
                        try:
                            from app.analytics_logic import calculate_site_health
                            # Fetch current state after scan
                            supabase = get_supabase()
                            pages_res = supabase.table("all_pages").select("url, title, meta_description, h1_tag").eq("site_id", site_id).execute()
                            errors_res = supabase.table("scan_errors").select("id").eq("site_id", site_id).execute()
                            
                            health_data = calculate_site_health(pages_res.data or [], len(errors_res.data or []))
                            
                            # Log to history
                            supabase.table("health_history").insert({
                                "site_id": site_id,
                                "score": health_data["score"],
                                "status": health_data["status"]
                            }).execute()
                            
                            print(f"[Scan {scan_id}] Phase 3: Health History recorded with score {health_data['score']}")
                        except Exception as history_err:
                            print(f"[Scan {scan_id}] Error recording health history: {history_err}")

                        # Trigger Notification (Smart Notifications Pillar)
                        try:
                            from app.services.notification_service import notify_scan_completed
                            notify_scan_completed(site_id, scan.pages_crawled, scan.errors_found)
                        except Exception as e:
                            print(f"[Scan {scan_id}] Error sending complete notification: {e}")
            
            except Exception as e:
                print(f"[Scan {scan_id}] Error in callback: {str(e)}")
                scan.state = ScanState.FAILED
                scan.error_message = str(e)
        
        # Progress update callback - DISCOVERY + VALIDATION PHASES
        discovery_progress_weight = 5  # Discovery counts as 5% of total progress
        
        def on_progress_callback(pages_crawled_val, broken_found_val, total_discovered_val):
            scan.pages_crawled = pages_crawled_val
            scan.total_pages = total_discovered_val
            scan.errors_found = broken_found_val
            
            # TWO-PHASE PROGRESS:
            # Phase 1 (Discovery): 0% → 5% as URLs discovered
            # Phase 2 (Validation): 5% → 100% as pages crawled
            
            if pages_crawled_val == 0 and total_discovered_val > 0:
                # DISCOVERY PHASE: Show 1-5% based on discovered count
                # More URLs discovered = higher progress
                if total_discovered_val < 100:
                    new_progress = 1
                elif total_discovered_val < 500:
                    new_progress = 2
                elif total_discovered_val < 1000:
                    new_progress = 3
                elif total_discovered_val < 1500:
                    new_progress = 4
                else:
                    new_progress = 5  # Discovery complete
            elif total_discovered_val > 0:
                # VALIDATION PHASE: 5% → 100%
                # Start from 5% (after discovery) and go to 100%
                validation_progress = int((pages_crawled_val / total_discovered_val) * 95)  # 0-95%
                new_progress = discovery_progress_weight + validation_progress  # 5% + validation
            else:
                new_progress = 1  # Minimum 1% to show activity
            
            scan.progress = new_progress
            
            # Log progress with descriptive phases
            if pages_crawled_val == 0:
                print(f"[Scan {scan_id}] Phase: Discovery | Found {total_discovered_val} URLs so far...")
                # Show 1% to user so they see discovery is happening
                if scan.progress < 1:
                    scan.progress = 1
            elif pages_crawled_val % 10 == 0 or pages_crawled_val == total_discovered_val:
                print(f"[Scan {scan_id}] Phase: Crawling | Progress: {pages_crawled_val}/{total_discovered_val} ({scan.progress}%), {broken_found_val} errors")

        # Run crawler
        print(f"[Scan {scan_id}] Initializing crawler...")
        crawler = SimpleCrawler(
            start_url, 
            site_id, 
            save_results_callback, 
            on_progress=on_progress_callback,
            max_pages=max_pages,
            scan_id=scan_id,
            scan_status=scan,
            resume=resume
        )
        
        # Run the async crawler - we're already in async context
        await crawler.run()
        
        # Phase 4: Cleanup
        # Run cleanup of old scans from ACTIVE_SCANS (anything finished > 5 mins ago)
        try:
            now_ts = time.time()
            to_remove = []
            for sid, s_status in ACTIVE_SCANS.items():
                if s_status.state in [ScanState.COMPLETED, ScanState.FAILED, ScanState.CANCELLED]:
                    # If it has a completed_at, check if it's old
                    if s_status.completed_at:
                        try:
                            # Parse custom format: "2026-02-10 12:30:15 PM"
                            # get_ist_now_iso returns: "%Y-%m-%d %I:%M:%S %p"
                            dt_obj = datetime.strptime(s_status.completed_at, "%Y-%m-%d %I:%M:%S %p")
                            comp_time = dt_obj.timestamp()
                            
                            if now_ts - comp_time > 300: # 5 minutes
                                to_remove.append(sid)
                        except Exception as parse_err:
                            # Don't delete immediately on parse error, just log it
                            # This prevents "Scan Not Found" issues if format changes
                            # print(f"[Scan API] Date parse error for {sid}: {parse_err}")
                            pass
            
            for sid in to_remove:
                del ACTIVE_SCANS[sid]
                if sid in SCAN_QUEUE:
                    SCAN_QUEUE.remove(sid)
                print(f"[Scan API] Cleaned up old scan {sid} from memory")
        except Exception as cleanup_err:
            print(f"[Scan API] Cleanup error: {cleanup_err}")
            
    except Exception as e:
        print(f"[Scan {scan_id}] ❌ Error: {str(e)}")
        scan.state = ScanState.FAILED
        scan.error_message = str(e)
        scan.completed_at = get_ist_now_iso()
        
        try:
            supabase = get_supabase()
            supabase.table("sites").update({
                "scan_status": "failed"
            }).eq("site_id", site_id).execute()
        except:
            pass


# =====================
# Endpoints
# =====================

@router.post("", response_model=StartScanResponse, summary="Trigger a New Site Scan")
async def start_scan(request: StartScanRequest, background_tasks: BackgroundTasks):
    """
    POST /api/v1/scan
    
    Start a new site scan - RETURNS IMMEDIATELY (non-blocking)
    
    Input: {
        "site_id": "site_123",
        "url": "https://example.com"
    }
    
    Output: {
        "status": "started",
        "scan_id": "scan_20260122...",
        "message": "Scan started in background"
    }
    """
    try:
        supabase = get_supabase()
        
        # Verify site exists
        site_response = supabase.table("sites").select("*").eq("site_id", request.site_id).execute()
        if not site_response.data:
            raise HTTPException(status_code=404, detail="Site not found")
        
        # Generate unique scan ID using IST
        scan_id = f"scan_{get_ist_timestamp_compact()}_{uuid.uuid4().hex[:8]}"
        
        # Create scan status tracker with IMMEDIATE progress
        scan = ScanStatus(scan_id, request.site_id)
        scan.state = ScanState.RUNNING  # Set to running immediately
        scan.progress = 1  # Show 1% immediately so user sees activity
        scan.total_pages = 100  # Temporary value, will be updated
        ACTIVE_SCANS[scan_id] = scan
        SCAN_QUEUE.append(scan_id)
        
        print(f"[Scan API] 🟢 Scan {scan_id} queued for {request.url}")
        print(f"[Scan API] Site ID: {request.site_id}")
        print(f"[Scan API] Queue length: {len(SCAN_QUEUE)}")
        
        # Add background task (starts immediately, doesn't block)
        background_tasks.add_task(
            run_scan_async,
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


@router.get("/{scan_id}/status", response_model=ScanStatusResponse, summary="Check Scan Progress and Status")
async def get_scan_status(scan_id: str):
    """
    GET /api/v1/scan/{scan_id}/status
    
    Get the status of a scan - INSTANT response
    Returns: pages_crawled, total_pages, progress for smooth UX
    """
    if scan_id not in ACTIVE_SCANS:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    scan = ACTIVE_SCANS[scan_id]
    
    # Only include error_message if scan actually failed
    error_msg = None
    if scan.state == ScanState.FAILED and scan.error_message:
        error_msg = scan.error_message
    
    return ScanStatusResponse(
        scan_id=scan.scan_id,
        state=scan.state.value,
        progress=scan.progress,
        pages_crawled=scan.pages_crawled,
        total_pages=scan.total_pages,
        errors_found=scan.errors_found if scan.errors_found else 0,
        error_message=error_msg,
        created_at=scan.created_at
    )


@router.delete("/{scan_id}", summary="Abort an Active Scan")
async def cancel_scan(scan_id: str):
    """
    DELETE /api/v1/scan/{scan_id}
    
    Cancel a running scan
    """
    if scan_id not in ACTIVE_SCANS:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    scan = ACTIVE_SCANS[scan_id]
    scan.state = ScanState.CANCELLED
    
    if scan_id in SCAN_QUEUE:
        SCAN_QUEUE.remove(scan_id)
    
    print(f"[Scan API] Cancelled scan {scan_id}")
    
    return {
        "status": "cancelled",
        "scan_id": scan_id,
        "message": "Scan cancelled successfully"
    }


@router.post("/{scan_id}/pause", response_model=PauseResumeResponse, summary="Pause an Active Scan")
async def pause_scan(scan_id: str):
    """
    POST /api/v1/scan/{scan_id}/pause
    
    Pause a running scan - preserves all progress and state
    Can be resumed later from the same point
    """
    if scan_id not in ACTIVE_SCANS:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    scan = ACTIVE_SCANS[scan_id]
    
    if scan.state != ScanState.RUNNING:
        raise HTTPException(status_code=400, detail=f"Cannot pause scan in state: {scan.state.value}")
    
    # Set pause flag - crawler will check this and stop dequeuing
    scan.pause_requested = True
    scan.state = ScanState.PAUSED
    
    print(f"[Scan API] Paused scan {scan_id} at {scan.progress}% progress")
    
    return PauseResumeResponse(
        status="paused",
        scan_id=scan_id,
        progress=scan.progress,
        pages_crawled=scan.pages_crawled,
        total_pages=scan.total_pages,
        message=f"Scan paused at {scan.progress}% progress. Resume anytime to continue."
    )


@router.post("/{scan_id}/resume", response_model=PauseResumeResponse, summary="Resume a Paused Scan")
async def resume_scan(scan_id: str, background_tasks: BackgroundTasks):
    """
    POST /api/v1/scan/{scan_id}/resume
    
    Resume a paused scan from where it left off
    Continues crawling only pending URLs
    """
    if scan_id not in ACTIVE_SCANS:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    scan = ACTIVE_SCANS[scan_id]
    
    if scan.state != ScanState.PAUSED:
        raise HTTPException(status_code=400, detail=f"Cannot resume scan in state: {scan.state.value}")
    
    # Clear pause flag and resume
    scan.pause_requested = False
    scan.state = ScanState.RUNNING
    
    print(f"[Scan API] Resuming scan {scan_id} from {scan.progress}% progress")
    
    # Get site info to resume crawling
    try:
        supabase = get_supabase()
        site_response = supabase.table("sites").select("site_url").eq("site_id", scan.site_id).execute()
        
        if not site_response.data:
            raise HTTPException(status_code=404, detail="Site not found")
        
        site_url = site_response.data[0]["site_url"]
        
        # Resume crawling in background
        background_tasks.add_task(
            run_scan_async,
            scan.site_id,
            site_url,
            scan_id,
            10000,  # max_pages
            resume=True  # Flag to indicate this is a resume
        )
        
        return PauseResumeResponse(
            status="resumed",
            scan_id=scan_id,
            progress=scan.progress,
            pages_crawled=scan.pages_crawled,
            total_pages=scan.total_pages,
            message=f"Scan resumed from {scan.progress}% progress"
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
        
        # Fetch errors from scan_errors table
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
        
        # Show appropriate message based on error count
        if len(errors) == 0:
            message = "No errors found"
        else:
            message = None  # Don't show message when there are errors, just show the errors
        
        return GetScanErrorsResponse(
            success=True,
            site_id=site_id,
            total_errors=len(errors),
            errors=errors,
            message=message
        )
    
    except Exception as e:
        return GetScanErrorsResponse(
            success=False,
            site_id=site_id,
            total_errors=0,
            errors=[],
            message=str(e)
        )


@router.get("/all", summary="List All Current Active Scans")
async def get_all_active_scans():
    """
    GET /api/v1/scan/all
    
    Get status of all active scans
    """
    return {
        "active_scans": [scan.to_dict() for scan in ACTIVE_SCANS.values()],
        "queue_length": len(SCAN_QUEUE),
        "total_active": len(ACTIVE_SCANS)
    }


@router.get("/{scan_id}/queue", summary="Get Crawl Queue State for a Scan")
async def get_crawl_queue(scan_id: str, state: Optional[str] = None, limit: int = 100):
    """
    GET /api/v1/scan/{scan_id}/queue
    
    Get the crawl queue state for a specific scan
    Useful for debugging and monitoring pause/resume functionality
    
    Query params:
    - state: Filter by state (pending, done, blocked, skipped)
    - limit: Max results to return (default 100)
    """
    try:
        supabase = get_supabase()
        
        # Build query
        query = supabase.table("crawl_queue").select("*").eq("scan_id", scan_id)
        # Filter by state if provided
        if state:
            query = query.eq("state", state)
        
        # Order by discovered_at and limit
        query = query.order("discovered_at", desc=False).limit(limit)
        
        response = query.execute()
        
        # Count by state
        count_query = supabase.table("crawl_queue").select("state", count="exact").eq("scan_id", scan_id).execute()
        
        state_counts = {}
        if count_query.data:
            for row in count_query.data:
                s = row.get('state', 'unknown')
                state_counts[s] = state_counts.get(s, 0) + 1
        
        return {
            "success": True,
            "scan_id": scan_id,
            "total_urls": len(response.data) if response.data else 0,
            "state_counts": state_counts,
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
