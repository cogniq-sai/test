"""
Redirect Suggestions Router - AI-powered redirect suggestions for broken links
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from app.schemas.redirect_schemas import (
    GenerateRedirectsRequest,
    GenerateRedirectsResponse,
    GetSuggestionsResponse,
    RedirectSuggestionResponse,
    SelectRedirectRequest,
    SelectRedirectResponse,
    ApplyRedirectsRequest,
    ApplyRedirectsResponse
)
from app.database.redirect_db import (
    insert_redirect_suggestion,
    get_suggestions_by_site,
    get_suggestion_by_id,
    update_suggestion_selection,
    update_suggestion_status,
    bulk_update_status,
    delete_suggestion,
    get_working_pages_for_site
)
from app.services.ai_redirect_service import RedirectSuggestionEngine
from app.services.nudge_service import schedule_nudge
from app.database import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/redirects", tags=["AI Redirect Suggestions"])


# =====================
# Background Task Functions
# =====================

async def generate_suggestions_background(site_id: str, scan_id: Optional[str] = None):
    """
    Background task to generate AI redirect suggestions
    """
    try:
        logger.info(f"Starting AI redirect suggestion generation for site: {site_id}")
        
        supabase = get_supabase()
        
        # Fetch broken links for this site
        # Fetch broken links for this site
        # We query 'scan_errors' table and filter for 404s
        query = supabase.table("scan_errors").select("*").eq("site_id", site_id).in_("status_code", [404])
        
        if scan_id:
            query = query.eq("scan_id", scan_id)
        
        result = query.execute()
        broken_links = result.data if result.data else []
        
        logger.info(f"[AI Suggest] Found {len(broken_links)} broken links for site {site_id} (Scan ID: {scan_id})")
        
        if not broken_links:
            logger.warning(f"[AI Suggest] No broken links (404s) found in database for site {site_id}")
            return
        
        # Get site URL for internal/external classification
        site_result = supabase.table("sites").select("site_url").eq("site_id", site_id).execute()
        site_url = ""
        if site_result.data and len(site_result.data) > 0:
            site_url = site_result.data[0].get("site_url", "")
        
        logger.info(f"[AI Suggest] Site URL for classification: {site_url}")
        
        # Helper to check if a URL is internal (same domain as site)
        def is_internal_url(broken_url: str) -> bool:
            if not site_url:
                return True
            try:
                from urllib.parse import urlparse
                broken_host = urlparse(broken_url).hostname or ""
                # If no hostname, it's a relative path, so it's internal
                if not broken_host:
                    return True
                    
                site_host = urlparse(site_url).hostname or ""
                return broken_host.replace("www.", "") == site_host.replace("www.", "")
            except Exception:
                return True
        
        # Split into internal (for AI) and external (store without AI)
        internal_links = []
        external_links = []
        for link in broken_links:
            burl = link.get("broken_url", "")
            if is_internal_url(burl):
                internal_links.append(link)
            else:
                external_links.append(link)
        
        logger.info(f"[AI Suggest] Split: {len(internal_links)} internal, {len(external_links)} external links for site {site_id}")
        
        # --- Process internal links with AI FIRST ---
        # (We store external links AFTER so the frontend poll doesn't see
        #  partial results and stop before AI suggestions are ready.)
        stored_count = 0
        
        if internal_links:
            logger.info(f"[AI Suggest] Proceeding to AI processing for {len(internal_links)} internal links")
            
            # Get working pages for context (fetch more pages for better AI matching)
            working_pages = await get_working_pages_for_site(site_id, limit=500)
            
            # If no working pages found, create a minimal context
            if not working_pages:
                logger.warning("No working pages found, using site homepage as fallback")
                if site_url:
                    working_pages = [{"url": site_url, "title": "Homepage"}]
            
            # Initialize AI engine
            engine = RedirectSuggestionEngine()
            
            # Prepare internal broken links data for AI
            broken_links_data = []
            for link in internal_links:
                anchor_text = link.get("anchor_text", "")
                # Fallback: if anchor text is N/A or empty, use explicit label
                if not anchor_text or anchor_text == "N/A":
                    anchor_text = "[No Anchor Text]"
                
                broken_links_data.append({
                    "url": link.get("broken_url", ""),
                    "source_url": link.get("source_url", ""),
                    "anchor_text": anchor_text
                })

            
            # Generate suggestions in batches
            suggestions = await engine.generate_batch_suggestions(
                broken_links=broken_links_data,
                available_pages=working_pages,
                batch_size=5  # Process 5 at a time to respect rate limits
            )
            
            # Store AI suggestions in database
            for suggestion in suggestions:
                try:
                    await insert_redirect_suggestion(
                        site_id=site_id,
                        broken_url=suggestion.broken_url,
                        source_url=suggestion.source_url,
                        anchor_text=suggestion.anchor_text,
                        primary_url=suggestion.primary.target_url,
                        primary_confidence=suggestion.primary.confidence,
                        primary_reason=suggestion.primary.reasoning,
                        primary_redirect_type=suggestion.primary.redirect_type,
                        alternative_url=suggestion.alternative.target_url if suggestion.alternative else None,
                        alternative_confidence=suggestion.alternative.confidence if suggestion.alternative else None,
                        alternative_reason=suggestion.alternative.reasoning if suggestion.alternative else None,
                        alternative_redirect_type=suggestion.alternative.redirect_type if suggestion.alternative else "301"
                    )
                    stored_count += 1
                except Exception as e:
                    logger.error(f"Error storing suggestion for {suggestion.broken_url}: {str(e)}")
        
        # --- Now store external links (after AI is done) ---
        for link in external_links:
            try:
                anchor_text = link.get("anchor_text", "")
                if not anchor_text or anchor_text == "N/A":
                    anchor_text = "[External Link]"
                await insert_redirect_suggestion(
                    site_id=site_id,
                    broken_url=link.get("broken_url", ""),
                    source_url=link.get("source_url", ""),
                    anchor_text=anchor_text,
                    primary_url="",
                    primary_confidence=0,
                    primary_reason="External URL — AI suggestion skipped",
                    primary_redirect_type="301"
                )
                stored_count += 1
            except Exception as e:
                logger.error(f"[AI Suggest] Error storing external suggestion: {e}")
        
        logger.info(f"[AI Suggest] FINISHED: stored {stored_count} total suggestions for site {site_id}")
        
    except Exception as e:
        logger.error(f"Error in generate_suggestions_background: {str(e)}")
        raise


# =====================
# API Endpoints
# =====================

@router.post("/generate", response_model=GenerateRedirectsResponse)
async def generate_redirect_suggestions(
    request: GenerateRedirectsRequest,
    background_tasks: BackgroundTasks
):
    """
    POST /api/v1/redirects/generate
    
    Trigger AI generation of redirect suggestions for broken links
    
    This endpoint starts a background job to process all broken links
    for the specified site and generate AI-powered redirect suggestions.
    """
    try:
        logger.info(f"Received request to generate redirects for site: {request.site_id}")
        
        # Helper for DB operations with retry
        def execute_with_retry(operation, max_retries=3):
            last_error = None
            for attempt in range(max_retries):
                try:
                    return operation()
                except Exception as e:
                    last_error = e
                    error_msg = str(e).lower()
                    if "disconnected" in error_msg or "timeout" in error_msg or "connection" in error_msg:
                        import time
                        wait = (attempt + 1) * 0.5
                        logger.warning(f"DB connection error (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {wait}s...")
                        time.sleep(wait)
                    else:
                        raise e
            raise last_error

        # Verify site exists with retry
        supabase = get_supabase()
        try:
            site_result = execute_with_retry(lambda: supabase.table("sites").select("*").eq("site_id", request.site_id).execute())
        except Exception as e:
            logger.error(f"Failed to fetch site {request.site_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

        if not site_result.data or len(site_result.data) == 0:
            raise HTTPException(status_code=404, detail=f"Site {request.site_id} not found")
        
        # Count broken links (404s only) with retry
        try:
            query = supabase.table("scan_errors").select("*", count="exact").eq("site_id", request.site_id).in_("status_code", [404])
            if request.scan_id:
                query = query.eq("scan_id", request.scan_id)
            
            result = execute_with_retry(lambda: query.execute())
            broken_count = result.count if hasattr(result, 'count') else len(result.data) if result.data else 0
        except Exception as e:
            logger.error(f"Failed to count broken links: {e}")
            # Fallback: if count fails, assume we have work to do and let background task handle it
            broken_count = 1 
        
        if broken_count == 0:
            return GenerateRedirectsResponse(
                success=False,
                message="No broken links found for this site",
                total_broken_links=0,
                suggestions_generated=0
            )
        
        # Start background task
        background_tasks.add_task(
            generate_suggestions_background,
            site_id=request.site_id,
            scan_id=request.scan_id
        )
        
        return GenerateRedirectsResponse(
            success=True,
            message=f"AI redirect generation started for broken links",
            total_broken_links=broken_count,
            suggestions_generated=0  # Will be updated in background
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating redirects: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{site_id}/suggestions", response_model=GetSuggestionsResponse)
async def get_redirect_suggestions(
    site_id: str,
    status: Optional[str] = Query(None, description="Filter by status: pending, approved, rejected, applied"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    GET /api/v1/redirects/{site_id}/suggestions
    
    Retrieve all redirect suggestions for a site
    
    Returns paginated list of AI-generated redirect suggestions with:
    - Primary and alternative redirect options
    - Confidence scores (0-100)
    - Reasoning for each suggestion
    - User selection status
    """
    try:
        logger.info(f"Fetching redirect suggestions for site: {site_id}")
        
        suggestions = await get_suggestions_by_site(
            site_id=site_id,
            status=status,
            limit=limit,
            offset=offset
        )
        
        # Convert to response models with custom URL priority logic
        suggestion_responses = []
        for suggestion in suggestions:
            # Create a localized copy of the suggestion dict to avoid mutating original data if needed
            resp_data = suggestion.copy()
            
            # If user selected custom URL, overwrite primary fields to reflect that
            if resp_data.get("selected_option") == "custom" and resp_data.get("custom_redirect_url"):
                resp_data["primary_url"] = resp_data["custom_redirect_url"]
                resp_data["primary_confidence"] = 100
                resp_data["primary_reason"] = "User defined custom redirect"
                # Optionally, you could also clear alternative or strictly set redirect type if needed
                # resp_data["primary_redirect_type"] = "301" 

            suggestion_responses.append(RedirectSuggestionResponse(**resp_data))
        
        return GetSuggestionsResponse(
            success=True,
            site_id=site_id,
            total=len(suggestion_responses),
            suggestions=suggestion_responses
        )
        
    except Exception as e:
        logger.error(f"Error fetching suggestions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{suggestion_id}/select", response_model=SelectRedirectResponse)
async def select_redirect_option(
    suggestion_id: str,
    request: SelectRedirectRequest
):
    """
    PUT /api/v1/redirects/{suggestion_id}/select
    
    User selects which redirect option to use
    
    Options:
    - 'primary': Use the primary (best match) suggestion
    - 'alternative': Use the alternative (backup) suggestion
    - 'custom': User provides their own redirect URL
    - 'rejected': User rejects all suggestions
    """
    try:
        logger.info(f"Updating selection for suggestion: {suggestion_id}")
        
        # Verify suggestion exists
        suggestion = await get_suggestion_by_id(suggestion_id)
        if not suggestion:
            raise HTTPException(status_code=404, detail=f"Suggestion {suggestion_id} not found")
        
        # Validate custom URL if provided
        if request.selected_option == "custom" and not request.custom_redirect_url:
            raise HTTPException(
                status_code=400,
                detail="custom_redirect_url is required when selected_option is 'custom'"
            )
        
        # Update selection
        updated = await update_suggestion_selection(
            suggestion_id=suggestion_id,
            selected_option=request.selected_option,
            custom_redirect_url=request.custom_redirect_url
        )
        
        # If approved, trigger nudge to plugin
        if updated.get("status") == "approved":
            schedule_nudge(suggestion.get("site_id", ""))
        
        return SelectRedirectResponse(
            success=True,
            suggestion_id=suggestion_id,
            selected_option=request.selected_option,
            status=updated.get("status", "approved"),
            message=f"Successfully selected {request.selected_option} option"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error selecting redirect option: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{suggestion_id}/approve", response_model=SelectRedirectResponse)
async def approve_redirect_suggestion(suggestion_id: str):
    """
    PUT /api/v1/redirects/{suggestion_id}/approve
    
    Explicitly approve a redirect suggestion
    
    This is used when a 'custom' redirect is selected (which doesn't auto-approve)
    or to re-approve a rejected suggestion.
    """
    try:
        logger.info(f"Approving suggestion: {suggestion_id}")
        
        # Verify suggestion exists
        suggestion = await get_suggestion_by_id(suggestion_id)
        if not suggestion:
            raise HTTPException(status_code=404, detail=f"Suggestion {suggestion_id} not found")
        
        # Validate and Auto-Repair Selection
        # If user "Undoes" a custom redirect, selected_option becomes NULL.
        # If they then click "Approve" (re-approve), we need to restore "custom"
        # if custom_redirect_url is present.
        current_selection = suggestion.get("selected_option")
        
        if not current_selection and suggestion.get("custom_redirect_url"):
            logger.info(f"Auto-repairing selection to 'custom' for {suggestion_id}")
            # Update selection to custom
            await update_suggestion_selection(
                suggestion_id=suggestion_id,
                selected_option="custom",
                custom_redirect_url=suggestion.get("custom_redirect_url")
            )
            # Refetch to get updated state
            suggestion = await get_suggestion_by_id(suggestion_id)

        # Update status to approved
        updated = await update_suggestion_status(suggestion_id=suggestion_id, status="approved")
        
        # Trigger nudge to plugin
        schedule_nudge(suggestion.get("site_id", ""))
        
        return SelectRedirectResponse(
            success=True,
            suggestion_id=suggestion_id,
            selected_option=updated.get("selected_option", ""),
            status="approved",
            message=f"Successfully approved suggestion {suggestion_id}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving suggestion: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{site_id}/apply", response_model=ApplyRedirectsResponse)
async def apply_redirects(
    site_id: str,
    request: ApplyRedirectsRequest
):
    """
    POST /api/v1/redirects/{site_id}/apply
    
    Mark redirect suggestions as applied
    
    This endpoint updates the status to 'applied' and sets the applied_at timestamp.
    Note: This does NOT actually implement the redirects on your server - that must
    be done separately (e.g., via WordPress plugin, .htaccess, etc.)
    """
    try:
        logger.info(f"Applying {len(request.suggestion_ids)} redirects for site: {site_id}")
        
        # Update status to 'applied'
        count = await bulk_update_status(
            suggestion_ids=request.suggestion_ids,
            status="applied"
        )
        
        return ApplyRedirectsResponse(
            success=True,
            applied_count=count,
            message=f"Successfully marked {count} redirects as applied"
        )
        
    except Exception as e:
        logger.error(f"Error applying redirects: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{suggestion_id}")
async def reject_suggestion(suggestion_id: str):
    """
    DELETE /api/v1/redirects/{suggestion_id}
    
    Reject a redirect suggestion
    
    This marks the suggestion as 'rejected' instead of deleting it,
    so you can track which suggestions were not useful.
    """
    try:
        logger.info(f"Rejecting suggestion: {suggestion_id}")
        
        # Verify suggestion exists
        suggestion = await get_suggestion_by_id(suggestion_id)
        if not suggestion:
            raise HTTPException(status_code=404, detail=f"Suggestion {suggestion_id} not found")
        
        # Update status to rejected
        await update_suggestion_status(suggestion_id=suggestion_id, status="rejected")
        
        return {
            "success": True,
            "message": f"Suggestion {suggestion_id} rejected"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting suggestion: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{suggestion_id}/undo")
async def undo_redirect(suggestion_id: str):
    """
    PUT /api/v1/redirects/{suggestion_id}/undo
    
    Undo an applied/approved redirect. Sets status to 'reverted' so the
    plugin deactivates it. After plugin confirms, mark-applied resets it
    to 'pending' so user can re-approve with original AI suggestions.
    """
    try:
        logger.info(f"Undoing redirect: {suggestion_id}")
        
        # Verify suggestion exists
        suggestion = await get_suggestion_by_id(suggestion_id)
        if not suggestion:
            raise HTTPException(status_code=404, detail=f"Suggestion {suggestion_id} not found")
        
        # Only applied/approved/rejected redirects can be undone
        if suggestion.get("status") not in ["applied", "approved", "rejected"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot undo redirect with status '{suggestion.get('status')}'. Only 'applied', 'approved', or 'rejected' redirects can be undone."
            )
        
        # Rejected redirects reset directly to pending (no plugin-side redirect to deactivate)
        if suggestion.get("status") == "rejected":
            await update_suggestion_status(suggestion_id=suggestion_id, status="pending")
            supabase = get_supabase()
            supabase.table("redirect_suggestions").update({
                "selected_option": None
            }).eq("id", suggestion_id).execute()
            
            return {
                "success": True,
                "message": f"Rejection undone. Suggestion {suggestion_id} is back to pending."
            }
        
        # Applied/approved: set to reverted so plugin sees it and deactivates
        await update_suggestion_status(suggestion_id=suggestion_id, status="reverted")
        
        # Clear selected_option so original AI suggestions show after final reset
        supabase = get_supabase()
        supabase.table("redirect_suggestions").update({
            "selected_option": None
        }).eq("id", suggestion_id).execute()
        
        # Trigger nudge to plugin so it deactivates this redirect
        schedule_nudge(suggestion.get("site_id", ""))
        
        return {
            "success": True,
            "message": f"Redirect {suggestion_id} marked for undo. Plugin will deactivate it shortly."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error undoing redirect: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
