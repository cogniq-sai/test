"""
Plugin router - WordPress plugin endpoints

CURRENT SCOPE:
- verify: Plugin verifies API key ✅
- all-pages: Plugin sends all valid pages ✅
- approved-redirects: Plugin fetches approved/reverted redirects ✅
- mark-applied: Plugin confirms redirect application ✅
- disconnect: Plugin notifies backend on disconnect ✅
"""

from fastapi import APIRouter, Depends
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

from app.database import get_supabase
from app.middleware import get_site_from_api_key
from app.utils import get_ist_now_iso
from app.schemas.plugin import (
    VerifyConnectionRequest,
    VerifyConnectionResponse,
    SyncAllPagesRequest,
    SyncAllPagesResponse,
    GetApprovedRedirectsResponse,
    RedirectItem,
    MarkAppliedRequest,
    MarkAppliedResponse,
)
from app.schemas.metadata_fixes import GetPendingFixesResponse, PendingFixItem


router = APIRouter(prefix="/api/v1/plugin", tags=["WordPress Plugin Integration"])


@router.post("/verify", response_model=VerifyConnectionResponse, summary="Authenticate and Connect Plugin")
def verify_connection(request: VerifyConnectionRequest):
    """
    Plugin verifies API key and establishes connection
    """
    try:
        supabase = get_supabase()

        result = (
            supabase.table("sites").select("*").eq("api_key", request.api_key).execute()
        )

        if not result.data or len(result.data) == 0:
            return VerifyConnectionResponse(
                success=False, error="Invalid API key", code="INVALID_API_KEY"
            )

        site = result.data[0]

        # Validate site URL matches (flexible: ignore protocol, www, trailing slash)
        import re
        def normalize_url(url: str) -> str:
            url = url.strip().rstrip("/").lower()
            url = re.sub(r'^https?://', '', url)   # strip http:// or https://
            url = re.sub(r'^www\.', '', url)        # strip www.
            return url

        registered_url = normalize_url(site.get("site_url", ""))
        provided_url = normalize_url(request.site_url)

        logger.info(f"[Verify] registered_url='{registered_url}', provided_url='{provided_url}'")

        if registered_url != provided_url:
            return VerifyConnectionResponse(
                success=False,
                error=f"API key does not match this site URL (registered: {registered_url}, got: {provided_url})",
                code="URL_MISMATCH",
            )

        # Update connection status (best-effort, don't fail verification if this errors)
        try:
            update_data = {
                "connection_status": "connected",
                "last_verified_at": get_ist_now_iso(),
            }
            if request.active_plugins is not None:
                update_data["active_seo_plugins"] = request.active_plugins
                
            supabase.table("sites").update(update_data).eq("api_key", request.api_key).execute()
        except Exception as update_err:
            logger.warning(f"[Verify] Status update failed (non-critical): {update_err}")

        return VerifyConnectionResponse(
            success=True,
            site_id=site.get("site_id"),
            site_name=site.get("site_name"),
            status="connected",
            message="Connection verified successfully!",
        )

    except Exception as e:
        return VerifyConnectionResponse(success=False, error=str(e))


@router.post("/all-pages", response_model=SyncAllPagesResponse, summary="Sync WordPress Page Inventory")
def sync_all_pages(
    request: SyncAllPagesRequest, site: dict = Depends(get_site_from_api_key)
):
    """
    Plugin sends all valid pages/posts from WordPress
    Called after successful connection
    
    Note: Plugin pages are assumed to be working (status_code: 200)
    since they come from WordPress database
    """
    try:
        supabase = get_supabase()
        site_id = site["site_id"]

        # Insert/Update pages (Upsert)
        if request.pages:
            rows = [
                {
                    "site_id": site_id,
                    "url": p.url.rstrip("/"),  # Normalize URL
                    "title": p.title.strip() if p.title else None,  # Clean title
                    "status_code": 200,  # Plugin pages are working
                    "status": "ok",  # Plugin pages are OK
                    "last_updated": get_ist_now_iso(),
                }
                for p in request.pages
            ]

            # Use upsert with on_conflict on site_id and url
            supabase.table("all_pages").upsert(rows, on_conflict="site_id,url").execute()

        # Update site's page sync status (optional)
        try:
            update_data = {"last_verified_at": get_ist_now_iso()}
            if request.active_plugins is not None:
                update_data["active_seo_plugins"] = request.active_plugins
                
            supabase.table("sites").update(update_data).eq(
                "site_id", site_id
            ).execute()
        except:
            pass

        return SyncAllPagesResponse(
            success=True,
            synced_count=len(request.pages),
            message=f"Synced {len(request.pages)} pages",
        )

    except Exception as e:
        return SyncAllPagesResponse(success=False, error=str(e))


@router.get("/approved-redirects", response_model=GetApprovedRedirectsResponse, summary="Fetch Approved Redirects for Plugin")
def get_approved_redirects(site: dict = Depends(get_site_from_api_key)):
    """
    Plugin fetches all redirects that need action:
    - status = 'approved' → plugin should apply these
    - status = 'reverted' → plugin should deactivate these
    
    After processing, plugin calls POST /plugin/mark-applied to confirm.
    """
    try:
        supabase = get_supabase()
        site_id = site["site_id"]

        # Fetch approved + reverted redirects for this site
        result = (
            supabase.table("redirect_suggestions")
            .select("id, broken_url, source_url, anchor_text, primary_url, alternative_url, primary_redirect_type, "
                     "alternative_redirect_type, selected_option, custom_redirect_url, status")
            .eq("site_id", site_id)
            .in_("status", ["approved", "reverted"])
            .execute()
        )

        redirects = []
        for row in result.data or []:
            # Determine the target URL based on what the user selected
            selected = row.get("selected_option", "primary")
            is_unlink = (selected == "unlinked")
            target_url = None

            if is_unlink:
                # Unlink doesn't need a target URL — plugin will strip the <a> tag
                target_url = "unlink-action"
            elif selected == "custom":
                target_url = row.get("custom_redirect_url")
            elif selected == "alternative":
                target_url = row.get("alternative_url")
            else:
                target_url = row.get("primary_url")

            # CRITICAL: If target_url is empty/None, the redirect is not ready to be applied.
            # This handles the case where an external link is 'approved' without a custom URL.
            # EXCEPTION: If status is 'reverted', we might need to process it even without a target_url just to deactivate it.
            if not target_url and row.get("status") != "reverted":
                if row.get("status") == "approved":
                    logger.warning(f"[PluginSync] Skipping approved suggestion {row['id']} because target_url is empty")
                continue
            
            # For reverted items, ensure we have at least a placeholder if target is missing
            if row.get("status") == "reverted" and not target_url:
                 target_url = "revert-placeholder"

            # Determine redirect type
            if selected == "alternative" and row.get("alternative_redirect_type"):
                redirect_type_str = row["alternative_redirect_type"]
            else:
                redirect_type_str = row.get("primary_redirect_type", "301")

            # Convert to int (301 or 302)
            try:
                redirect_type = int(redirect_type_str)
            except (ValueError, TypeError):
                redirect_type = 301

            # For reverted unlinks, fetch the original HTML backup so plugin can restore
            original_html = None
            if is_unlink and row.get("status") == "reverted":
                try:
                    backup_result = supabase.table("unlink_backups").select("original_html").eq("suggestion_id", row["id"]).execute()
                    if backup_result.data:
                        original_html = backup_result.data[0].get("original_html")
                except Exception as backup_err:
                    logger.warning(f"[PluginSync] Could not fetch unlink backup for {row['id']}: {backup_err}")

            redirects.append(RedirectItem(
                id=row["id"],
                source_url=row["broken_url"],
                target_url=target_url,
                redirect_type=redirect_type,
                status=row["status"],
                action="unlink" if is_unlink else "redirect",
                source_page_url=row.get("source_url"),
                anchor_text=row.get("anchor_text"),
                original_html=original_html,
            ))

        return GetApprovedRedirectsResponse(
            success=True,
            redirects=redirects,
            total=len(redirects),
            message=f"Found {len(redirects)} redirect(s) to process",
        )

    except Exception as e:
        return GetApprovedRedirectsResponse(success=False, error=str(e))


@router.get("/pending-metadata-fixes", response_model=GetPendingFixesResponse, summary="Fetch Pending Metadata Optimizations")
def get_pending_metadata_fixes(site: dict = Depends(get_site_from_api_key)):
    """
    Plugin fetches all metadata optimizations (title, description, h1) that need applying.
    """
    try:
        supabase = get_supabase()
        site_id = site["site_id"]

        result = (
            supabase.table("metadata_optimizations")
            .select("id, page_url, field, suggested_value")
            .eq("site_id", site_id)
            .eq("status", "pending")
            .execute()
        )

        fixes = [
            PendingFixItem(
                id=row["id"],
                page_url=row["page_url"],
                field=row["field"],
                suggested_value=row["suggested_value"]
            )
            for row in result.data or []
        ]

        return GetPendingFixesResponse(
            success=True,
            fixes=fixes,
            total=len(fixes)
        )

    except Exception as e:
        return GetPendingFixesResponse(success=False, fixes=[], total=0, error=str(e))


@router.post("/mark-applied", response_model=MarkAppliedResponse, summary="Confirm Redirect Application")
def mark_redirects_applied(
    request: MarkAppliedRequest, site: dict = Depends(get_site_from_api_key)
):
    """
    Plugin confirms which redirects it has successfully applied or reverted.
    
    - applied_ids: Redirects that are now live on the WP site → status becomes 'applied'
    - reverted_ids: Redirects that have been deactivated → status becomes 'undone'
    """
    try:
        supabase = get_supabase()

        applied_count = 0
        reverted_count = 0

        # Mark applied redirects
        if request.applied_ids:
            supabase.table("redirect_suggestions").update({
                "status": "applied",
                "applied_at": get_ist_now_iso(),
                "updated_at": get_ist_now_iso(),
            }).in_("id", request.applied_ids).execute()
            applied_count = len(request.applied_ids)

        # Mark reverted redirects as pending (back to original state for re-approval)
        if request.reverted_ids:
            supabase.table("redirect_suggestions").update({
                "status": "pending",
                "applied_at": None,
                "updated_at": get_ist_now_iso(),
            }).in_("id", request.reverted_ids).execute()
            reverted_count = len(request.reverted_ids)
            
        # Store unlink backups (original <a> tag HTML for undo support)
        if request.unlink_backups:
            for backup in request.unlink_backups:
                try:
                    supabase.table("unlink_backups").upsert({
                        "suggestion_id": backup.id,
                        "site_id": site["site_id"],
                        "original_html": backup.original_html,
                        "source_page_url": "",
                        "broken_url": "",
                    }, on_conflict="suggestion_id").execute()
                    logger.info(f"[PluginSync] Stored unlink backup for {backup.id}")
                except Exception as e:
                    logger.error(f"[PluginSync] Error storing unlink backup for {backup.id}: {e}")

        # Handle failed items
        failed_count = 0
        if request.failed_items:
            for item in request.failed_items:
                try:
                    s_id = item.get("id")
                    reason = item.get("reason", "Unknown failure")
                    
                    if s_id:
                        # Detect manual removal needed (page builder pages where link can't be found)
                        if reason == "manual_removal_needed":
                            stored_reason = "[MANUAL] Link not found automatically — page may use a page builder (Divi, WPBakery, etc.). Please remove the link manually."
                        else:
                            stored_reason = f"[FAILURE] {reason}"

                        supabase.table("redirect_suggestions").update({
                            "status": "failed",
                            "primary_reason": stored_reason,
                            "updated_at": get_ist_now_iso()
                        }).eq("id", s_id).execute()
                        failed_count = failed_count + 1
                except Exception as e:
                    logger.error(f"[PluginSync] Error processing failed item {item}: {e}")

        return MarkAppliedResponse(
            success=True,
            applied_count=applied_count,
            reverted_count=reverted_count,
            message=f"Synced: {applied_count} applied, {reverted_count} reverted, {failed_count} failed"
        )

    except Exception as e:
        return MarkAppliedResponse(success=False, error=str(e))


@router.post("/disconnect", summary="Plugin Disconnect Notification")
def plugin_disconnect(site: dict = Depends(get_site_from_api_key)):
    """
    Plugin notifies backend when user disconnects.
    Updates site status so frontend reflects the change.
    Resets "stuck" suggestion states (approved/reverting) back to pending.
    """
    try:
        supabase = get_supabase()
        site_id = site.get("site_id")

        # 1. Update site status
        supabase.table("sites").update({
            "connection_status": "disconnected",
            "updated_at": get_ist_now_iso(),
        }).eq("site_id", site_id).execute()

        # 2. Reset "stuck" suggestions for this site
        # If the plugin is gone, any approved/reverting changes can't be completed.
        # We push them back to pending so the user can re-approve them later.
        supabase.table("redirect_suggestions").update({
            "status": "pending",
            "updated_at": get_ist_now_iso()
        }).eq("site_id", site_id).in_("status", ["approved", "reverting"]).execute()

        return {"success": True, "message": "Disconnected successfully and suggestions reset."}
    except Exception as e:
        logger.warning(f"[Disconnect] Update failed for site {site.get('site_id')}: {e}")
        return {"success": False, "error": str(e)}
        return {"success": True, "message": "Disconnected (status update skipped)"}
