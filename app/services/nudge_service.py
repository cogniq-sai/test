"""
Nudge Service - Debounced push notifications to WordPress plugin

When a redirect is approved/reverted, we don't immediately ping the plugin.
Instead, we debounce: wait 20 seconds after the last change, then send a
lightweight "trigger-sync" ping to the plugin's WP REST API endpoint.

The ping carries NO data — it just tells the plugin to initiate a sync.
The plugin then pulls approved redirects from our API.
"""

import asyncio
import logging
import httpx
from typing import Dict, Optional

from app.database import get_supabase

logger = logging.getLogger(__name__)

# In-memory store of pending nudge tasks per site_id
# Key: site_id, Value: asyncio.Task
_pending_nudges: Dict[str, asyncio.Task] = {}

NUDGE_DELAY_SECONDS = 10


async def _send_nudge(site_id: str, site_url: str, api_key: str):
    """
    Actually send the nudge ping to the plugin's WP REST API endpoint.
    Called after the debounce delay.
    """
    # Construct the WP REST API endpoint
    wp_rest_url = site_url.rstrip("/") + "/wp-json/aiseo/v1/trigger-sync"
    
    try:
        logger.info(f"[Nudge] Sending sync trigger to {wp_rest_url} for site {site_id}")
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                wp_rest_url,
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json"
                },
                json={"action": "sync_redirects"}
            )
            
            if response.status_code == 200:
                logger.info(f"[Nudge] Successfully triggered sync for site {site_id}")
            else:
                logger.warning(
                    f"[Nudge] Plugin returned {response.status_code} for site {site_id}. "
                    f"Response: {response.text[:200]}. "
                    f"Cron backup will handle sync."
                )
                
    except httpx.TimeoutException:
        logger.warning(f"[Nudge] Timeout reaching plugin for site {site_id}. Cron backup will handle sync.")
    except httpx.ConnectError:
        logger.warning(f"[Nudge] Cannot connect to plugin for site {site_id}. Cron backup will handle sync.")
    except Exception as e:
        logger.error(f"[Nudge] Error sending nudge for site {site_id}: {str(e)}. Cron backup will handle sync.")
    finally:
        # Clean up from pending nudges
        _pending_nudges.pop(site_id, None)


async def _debounced_nudge(site_id: str, site_url: str, api_key: str):
    """
    Wait for NUDGE_DELAY_SECONDS then send the nudge.
    If cancelled (because a new nudge was scheduled), this just stops.
    """
    try:
        await asyncio.sleep(NUDGE_DELAY_SECONDS)
        await _send_nudge(site_id, site_url, api_key)
    except asyncio.CancelledError:
        logger.debug(f"[Nudge] Debounce cancelled for site {site_id} (new change detected)")


def schedule_nudge(site_id: str):
    """
    Schedule a debounced nudge for a site.
    
    If a nudge is already pending for this site, cancel it and reschedule.
    This ensures rapid-fire approvals only result in one nudge after 20s of quiet.
    """
    try:
        # Look up site info 
        supabase = get_supabase()
        result = supabase.table("sites").select("site_url, api_key, connection_status").eq("site_id", site_id).execute()
        
        if not result.data or len(result.data) == 0:
            logger.warning(f"[Nudge] Site {site_id} not found, skipping nudge")
            return
        
        site = result.data[0]
        
        # Only nudge if plugin is connected
        if site.get("connection_status") != "connected":
            logger.info(f"[Nudge] Site {site_id} plugin not connected, skipping nudge")
            return
        
        site_url = site.get("site_url", "")
        api_key = site.get("api_key", "")
        
        if not site_url or not api_key:
            logger.warning(f"[Nudge] Missing site_url or api_key for site {site_id}")
            return
        
        # Cancel existing pending nudge for this site
        existing_task = _pending_nudges.get(site_id)
        if existing_task and not existing_task.done():
            existing_task.cancel()
            logger.debug(f"[Nudge] Cancelled previous pending nudge for site {site_id}")
        
        # Schedule new debounced nudge
        loop = asyncio.get_event_loop()
        task = loop.create_task(_debounced_nudge(site_id, site_url, api_key))
        _pending_nudges[site_id] = task
        
        logger.info(f"[Nudge] Scheduled nudge for site {site_id} in {NUDGE_DELAY_SECONDS}s")
        
    except Exception as e:
        logger.error(f"[Nudge] Error scheduling nudge for site {site_id}: {str(e)}")
