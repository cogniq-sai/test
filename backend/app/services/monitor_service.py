"""
Monitor Service - Background tasks to ensure system health
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from app.database import get_supabase

logger = logging.getLogger(__name__)

async def check_stale_redirects():
    """
    Find redirects that have been stuck in 'approved' or 'reverted' state for too long.
    Mark them as failed to allow user to retry.
    Run this periodically (e.g., every 30-60 mins).
    """
    logger.info("[Monitor] Checking for stale redirects...")
    
    supabase = get_supabase()
    
    # Threshold: 1 hour ago
    # Note: supabase-py returns ISO strings, so we rely on database query filtering if possible,
    # or fetch and filter in Python if simple query isn't enough.
    # Supabase/PostgREST filter "lt" (less than) works with timestamps.
    
    # We want: updated_at < (now - 1 hour) AND status IN ('approved', 'reverted')
    
    threshold = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    
    try:
        # Fetch stale candidates
        # We can't do complex ORs easily in one go with simple client, 
        # so we can do two queries or one query for 'approved'/'reverted' then filter time.
        # Let's fetch all 'approved' and 'reverted' (likely small number) and filter in memory for safety
        # unless volume is huge. Assuming "pending/processing" volume is low.
        
        response = (
            supabase.table("redirect_suggestions")
            .select("id, status, updated_at")
            .in_("status", ["approved", "reverted"])
            .lt("updated_at", threshold)
            .execute()
        )
        
        stale_items = response.data or []
        
        if not stale_items:
            logger.info("[Monitor] No stale redirects found.")
            return

        logger.info(f"[Monitor] Found {len(stale_items)} stale redirects. Marking as failed.")
        
        for item in stale_items:
            # Mark as failed
            # We assume 'failed' status is supported now (verified in previous steps)
            update_data = {
                "status": "failed",
                "primary_reason": "Plugin sync timeout - Check connection",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            (
                supabase.table("redirect_suggestions")
                .update(update_data)
                .eq("id", item["id"])
                .execute()
            )
            
            logger.info(f"[Monitor] Marked redirect {item['id']} as failed (was {item['status']})")
            
    except Exception as e:
        logger.error(f"[Monitor] Error checking stale redirects: {str(e)}")

async def start_monitor_loop():
    """Run the monitor task periodically"""
    while True:
        try:
            await check_stale_redirects()
        except Exception as e:
            logger.error(f"[Monitor] Loop error: {str(e)}")
        
        # Wait 30 minutes
        await asyncio.sleep(1800)
