"""
Redis State Manager - Distributed State Storage
Replaces in-memory ACTIVE_SCANS dict with Redis for scalability
"""

import json
import os
from typing import Optional, Dict, List
from datetime import datetime
import redis
from dotenv import load_dotenv

load_dotenv()

# Redis connection
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)


class ScanStateManager:
    """Manages scan state in Redis for distributed access"""
    
    SCAN_PREFIX = "scan:"
    SCAN_LIST_KEY = "scans:active"
    SCAN_QUEUE_KEY = "scans:queue"
    
    @staticmethod
    def create_scan(scan_id: str, site_id: str) -> Dict:
        """Create a new scan in Redis"""
        scan_data = {
            "scan_id": scan_id,
            "site_id": site_id,
            "state": "queued",
            "progress": 0,
            "pages_crawled": 0,
            "total_pages": 0,
            "errors_found": 0,
            "error_message": None,
            "created_at": datetime.utcnow().isoformat(),
            "started_at": None,
            "completed_at": None,
            "pause_requested": False
        }
        
        # Store in Redis
        key = f"{ScanStateManager.SCAN_PREFIX}{scan_id}"
        redis_client.setex(key, 86400, json.dumps(scan_data))  # Expire after 24 hours
        
        # Add to active scans list
        redis_client.sadd(ScanStateManager.SCAN_LIST_KEY, scan_id)
        
        # Add to queue
        redis_client.rpush(ScanStateManager.SCAN_QUEUE_KEY, scan_id)
        
        return scan_data
    
    @staticmethod
    def get_scan(scan_id: str) -> Optional[Dict]:
        """Get scan data from Redis"""
        key = f"{ScanStateManager.SCAN_PREFIX}{scan_id}"
        data = redis_client.get(key)
        
        if data:
            return json.loads(data)
        return None
    
    @staticmethod
    def update_scan(scan_id: str, updates: Dict) -> bool:
        """Update scan data in Redis"""
        scan_data = ScanStateManager.get_scan(scan_id)
        if not scan_data:
            return False
        
        # Update fields
        scan_data.update(updates)
        
        # Save back to Redis
        key = f"{ScanStateManager.SCAN_PREFIX}{scan_id}"
        redis_client.setex(key, 86400, json.dumps(scan_data))
        
        return True
    
    @staticmethod
    def delete_scan(scan_id: str) -> bool:
        """Delete scan from Redis"""
        key = f"{ScanStateManager.SCAN_PREFIX}{scan_id}"
        redis_client.delete(key)
        redis_client.srem(ScanStateManager.SCAN_LIST_KEY, scan_id)
        return True
    
    @staticmethod
    def get_all_active_scans() -> List[Dict]:
        """Get all active scans"""
        scan_ids = redis_client.smembers(ScanStateManager.SCAN_LIST_KEY)
        scans = []
        
        for scan_id in scan_ids:
            scan_data = ScanStateManager.get_scan(scan_id)
            if scan_data:
                scans.append(scan_data)
        
        return scans
    
    @staticmethod
    def get_queue_length() -> int:
        """Get number of scans in queue"""
        return redis_client.llen(ScanStateManager.SCAN_QUEUE_KEY)
    
    @staticmethod
    def set_pause_flag(scan_id: str, pause: bool) -> bool:
        """Set pause flag for a scan"""
        return ScanStateManager.update_scan(scan_id, {"pause_requested": pause})
    
    @staticmethod
    def update_progress(scan_id: str, pages_crawled: int, total_pages: int, errors_found: int) -> bool:
        """Update scan progress"""
        progress = int((pages_crawled / total_pages * 100)) if total_pages > 0 else 0
        
        return ScanStateManager.update_scan(scan_id, {
            "pages_crawled": pages_crawled,
            "total_pages": total_pages,
            "errors_found": errors_found,
            "progress": progress
        })
    
    @staticmethod
    def mark_running(scan_id: str) -> bool:
        """Mark scan as running"""
        return ScanStateManager.update_scan(scan_id, {
            "state": "running",
            "started_at": datetime.utcnow().isoformat()
        })
    
    @staticmethod
    def mark_completed(scan_id: str) -> bool:
        """Mark scan as completed"""
        return ScanStateManager.update_scan(scan_id, {
            "state": "completed",
            "completed_at": datetime.utcnow().isoformat(),
            "progress": 100
        })
    
    @staticmethod
    def mark_failed(scan_id: str, error_message: str) -> bool:
        """Mark scan as failed"""
        return ScanStateManager.update_scan(scan_id, {
            "state": "failed",
            "error_message": error_message,
            "completed_at": datetime.utcnow().isoformat()
        })
    
    @staticmethod
    def mark_paused(scan_id: str) -> bool:
        """Mark scan as paused"""
        return ScanStateManager.update_scan(scan_id, {
            "state": "paused"
        })
    
    @staticmethod
    def mark_cancelled(scan_id: str) -> bool:
        """Mark scan as cancelled"""
        return ScanStateManager.update_scan(scan_id, {
            "state": "cancelled",
            "completed_at": datetime.utcnow().isoformat()
        })


# Helper function to check Redis connection
def check_redis_connection() -> bool:
    """Check if Redis is available"""
    try:
        redis_client.ping()
        return True
    except Exception as e:
        print(f"Redis connection failed: {e}")
        return False
