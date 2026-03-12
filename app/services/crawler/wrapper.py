"""
Wrapper to maintain API compatibility with existing scan.py code
"""

import logging
from typing import Callable, Optional, Dict, Any, List

from .crawler import HybridCrawler, BrokenLink

logger = logging.getLogger(__name__)


class SimpleCrawler:
    """
    Compatibility wrapper around HybridCrawler
    Maintains the same API as the old Scrapy-based SimpleCrawler
    Supports pause/resume functionality
    Uses hybrid approach: HTTP (fast) + Browser (Cloudflare bypass)
    """
    
    def __init__(
        self,
        site_url: str,
        site_id: str,
        callback_fn: Optional[Callable] = None,
        on_progress: Optional[Callable] = None,
        max_pages: int = 1000,
        scan_id: Optional[str] = None,
        scan_status: Optional[Any] = None,
        resume: bool = False
    ):
        self.site_url = site_url
        self.site_id = site_id
        self.callback_fn = callback_fn
        self.on_progress = on_progress
        self.max_pages = max_pages
        self.scan_id = scan_id
        self.scan_status = scan_status
        self.resume = resume
        
        # Initialize HYBRID crawler (HTTP + Browser)
        # ULTRA-FAST MODE: Target 1 minute for any website
        # 2000 pages in 60 seconds = 33 pages/second
        self.crawler = HybridCrawler(
            start_url=site_url,
            max_pages=max_pages,
            concurrent_requests=20,      # Dynamic scaling cap (was 2)
            requests_per_second=1.0,     # 1 req/sec baseline
            scan_id=scan_id,
            scan_status=scan_status,
            resume=resume,
            site_id=site_id
        )
        
        # Results storage (for compatibility)
        self.broken_links: List[BrokenLink] = []
        self.visited_urls: Dict[str, Dict[str, Any]] = {}
    
    async def run(self):
        """
        Run the crawler and call callbacks
        """
        logger.info(f"[SimpleCrawler] Starting HYBRID crawl for {self.site_url}")
        logger.info(f"[SimpleCrawler] Mode: HTTP (fast) + Browser (Cloudflare bypass)")
        
        # Progress callback wrapper
        def progress_wrapper(crawled, errors, discovered):
            if self.on_progress:
                self.on_progress(crawled, errors, discovered)
        
        # Run the crawler
        await self.crawler.crawl(progress_callback=progress_wrapper)
        
        # Convert results to old format
        self.broken_links = self.crawler.broken_links
        self.visited_urls = self.crawler.pages
        
        logger.info(
            f"[SimpleCrawler] Crawl complete. "
            f"Visited: {len(self.visited_urls)}, "
            f"Broken: {len(self.broken_links)}"
        )
        
        # Call final callback
        if self.callback_fn:
            self.callback_fn(self.broken_links, self.visited_urls, self.site_id)
