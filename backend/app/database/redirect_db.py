"""
Database operations for redirect suggestions
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime
from app.database import get_supabase

logger = logging.getLogger(__name__)


async def insert_redirect_suggestion(
    site_id: str,
    broken_url: str,
    source_url: str,
    anchor_text: str,
    primary_url: str,
    primary_confidence: int,
    primary_reason: str,
    primary_redirect_type: str = "301",
    alternative_url: Optional[str] = None,
    alternative_confidence: Optional[int] = None,
    alternative_reason: Optional[str] = None,
    alternative_redirect_type: str = "301"
) -> Dict:
    """
    Insert a new redirect suggestion into the database
    
    Returns:
        The inserted record
    """
    try:
        supabase = get_supabase()
        
        data = {
            "site_id": site_id,
            "broken_url": broken_url,
            "source_url": source_url,
            "anchor_text": anchor_text,
            "primary_url": primary_url,
            "primary_confidence": primary_confidence,
            "primary_reason": primary_reason,
            "primary_redirect_type": primary_redirect_type,
            "alternative_url": alternative_url,
            "alternative_confidence": alternative_confidence,
            "alternative_reason": alternative_reason,
            "alternative_redirect_type": alternative_redirect_type,
            "status": "pending",
            "updated_at": datetime.now().isoformat()
        }
        
        # Use upsert to replace old suggestions with new AI-generated ones
        result = supabase.table("redirect_suggestions").upsert(
            data,
            on_conflict="site_id,broken_url"  # Replace if same site_id + broken_url exists
        ).execute()
        
        if result.data:
            logger.info(f"Upserted redirect suggestion for {broken_url}")
            return result.data[0]
        else:
            raise Exception("No data returned from upsert")
            
    except Exception as e:
        logger.error(f"Error upserting redirect suggestion: {str(e)}")
        raise


async def get_suggestions_by_site(
    site_id: str,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> List[Dict]:
    """
    Get all redirect suggestions for a site
    
    Args:
        site_id: The site ID
        status: Filter by status (pending, approved, rejected, applied)
        limit: Maximum number of results
        offset: Pagination offset
        
    Returns:
        List of suggestion records
    """
    try:
        supabase = get_supabase()
        
        query = supabase.table("redirect_suggestions").select("*").eq("site_id", site_id)
        
        if status:
            query = query.eq("status", status)
        
        query = query.order("created_at", desc=True).limit(limit).offset(offset)
        
        result = query.execute()
        
        return result.data if result.data else []
        
    except Exception as e:
        logger.error(f"Error fetching suggestions for site {site_id}: {str(e)}")
        raise


async def get_suggestion_by_id(suggestion_id: str) -> Optional[Dict]:
    """
    Get a single redirect suggestion by ID
    
    Returns:
        Suggestion record or None if not found
    """
    try:
        supabase = get_supabase()
        
        result = supabase.table("redirect_suggestions").select("*").eq("id", suggestion_id).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
        
    except Exception as e:
        logger.error(f"Error fetching suggestion {suggestion_id}: {str(e)}")
        raise


async def update_suggestion_selection(
    suggestion_id: str,
    selected_option: str,
    custom_redirect_url: Optional[str] = None
) -> Dict:
    """
    Update user's selection for a redirect suggestion
    
    Args:
        suggestion_id: The suggestion ID
        selected_option: 'primary', 'alternative', 'custom', or 'rejected'
        custom_redirect_url: Custom URL if selected_option is 'custom'
        
    Returns:
        Updated record
    """
    try:
        supabase = get_supabase()
        
        data = {
            "selected_option": selected_option,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if selected_option == "custom" and custom_redirect_url:
            data["custom_redirect_url"] = custom_redirect_url
        
        # Update status based on selection
        if selected_option == "rejected":
            data["status"] = "rejected"
        elif selected_option != "custom":
            # Auto-approve primary/alternative/unlinked selections, but keep custom as pending
            # until explicitly approved by user via separate action
            data["status"] = "approved"
        
        result = supabase.table("redirect_suggestions").update(data).eq("id", suggestion_id).execute()
        
        if result.data:
            logger.info(f"Updated suggestion {suggestion_id} with selection: {selected_option}")
            return result.data[0]
        else:
            raise Exception("No data returned from update")
            
    except Exception as e:
        logger.error(f"Error updating suggestion selection: {str(e)}")
        raise


async def update_suggestion_status(
    suggestion_id: str,
    status: str
) -> Dict:
    """
    Update the status of a redirect suggestion
    
    Args:
        suggestion_id: The suggestion ID
        status: New status (pending, approved, rejected, applied)
        
    Returns:
        Updated record
    """
    try:
        supabase = get_supabase()
        
        data = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if status == "applied":
            data["applied_at"] = datetime.utcnow().isoformat()
        
        result = supabase.table("redirect_suggestions").update(data).eq("id", suggestion_id).execute()
        
        if result.data:
            logger.info(f"Updated suggestion {suggestion_id} status to: {status}")
            return result.data[0]
        else:
            raise Exception("No data returned from update")
            
    except Exception as e:
        logger.error(f"Error updating suggestion status: {str(e)}")
        raise


async def bulk_update_status(
    suggestion_ids: List[str],
    status: str
) -> int:
    """
    Update status for multiple suggestions at once
    
    Args:
        suggestion_ids: List of suggestion IDs
        status: New status to apply
        
    Returns:
        Number of records updated
    """
    try:
        supabase = get_supabase()
        
        data = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if status == "applied":
            data["applied_at"] = datetime.utcnow().isoformat()
        
        result = supabase.table("redirect_suggestions").update(data).in_("id", suggestion_ids).execute()
        
        count = len(result.data) if result.data else 0
        logger.info(f"Updated {count} suggestions to status: {status}")
        return count
        
    except Exception as e:
        logger.error(f"Error bulk updating suggestions: {str(e)}")
        raise


async def delete_suggestion(suggestion_id: str) -> bool:
    """
    Delete a redirect suggestion
    
    Returns:
        True if deleted successfully
    """
    try:
        supabase = get_supabase()
        
        result = supabase.table("redirect_suggestions").delete().eq("id", suggestion_id).execute()
        
        logger.info(f"Deleted suggestion {suggestion_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error deleting suggestion: {str(e)}")
        raise


async def get_working_pages_for_site(site_id: str, limit: int = 100) -> List[Dict[str, str]]:
    """
    Get list of working pages for a site (for AI context)
    
    Returns:
        List of dicts with 'url' and 'title' keys
    """
    try:
        supabase = get_supabase()
        
        # Get crawled pages from 'all_pages' where status_code = 200
        result = supabase.table("all_pages").select("url, title, meta_description").eq("site_id", site_id).eq("status_code", 200).limit(limit).execute()
        
        if result.data:
            return result.data
            
        logger.warning(f"No working pages found for site {site_id}")
        return []
        
    except Exception as e:
        logger.error(f"Error fetching working pages: {str(e)}")
        return []
