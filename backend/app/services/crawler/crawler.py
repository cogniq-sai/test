"""
Complete Crawler System - All-in-One
Includes: Custom HTTP crawler, Browser crawler, WordPress crawler, Hybrid crawler
"""

import asyncio
import logging
import re
import html
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Set, Dict, List, Optional, Tuple, Any
from urllib.parse import urlparse, urljoin, urlunparse
from urllib.robotparser import RobotFileParser
import random
import xml.etree.ElementTree as ET

import httpx
# from bs4 import BeautifulSoup
# from playwright.async_api import async_playwright, Browser, BrowserContext, Page, TimeoutError as PlaywrightTimeout
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


# ===========================
# Per-Domain Rate Limiter
# ===========================

class DomainRateLimiter:
    """Per-domain rate limiter with WAF soft-block detection"""
    
    def __init__(self, requests_per_second: float = 100.0):
        self._requests_per_second = requests_per_second
        self.min_interval = 1.0 / requests_per_second
        self.domain_last_request: Dict[str, float] = {}
        self.domain_failures: Dict[str, int] = {}
        self.domain_cooldown: Dict[str, float] = {}
        self.lock = asyncio.Lock()

    @property
    def requests_per_second(self) -> float:
        return self._requests_per_second

    @requests_per_second.setter
    def requests_per_second(self, value: float):
        self._requests_per_second = float(value)
        self.min_interval = 1.0 / value if value > 0 else 0
    
    async def wait_if_needed(self, domain: str):
        """Wait if we're going too fast for this domain"""
        async with self.lock:
            now = time.time()
            last_request = self.domain_last_request.get(domain, 0)
            time_since_last = now - last_request
            
            if time_since_last < self.min_interval:
                wait_time = self.min_interval - time_since_last
                await asyncio.sleep(wait_time)
            
            self.domain_last_request[domain] = time.time()
    
    def record_failure(self, domain: str):
        """Record failure"""
        self.domain_failures[domain] = self.domain_failures.get(domain, 0) + 1
    
    def record_success(self, domain: str):
        """Record success"""
        if domain in self.domain_failures:
            self.domain_failures[domain] = 0


# ===========================
# Robots.txt Parser
# ===========================

class RobotsParser:
    """Handles robots.txt parsing and compliance"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.parser = RobotFileParser()
        self.robots_url = urljoin(base_url, '/robots.txt')
        self.initialized = False
        self.logger = logging.getLogger(__name__)

    async def fetch(self, client: httpx.AsyncClient):
        """Fetch and parse robots.txt asynchronously"""
        try:
            response = await client.get(self.robots_url, timeout=5.0, follow_redirects=True)
            if response.status_code == 200:
                self.parser.parse(response.text.splitlines())
                self.initialized = True
                self.logger.info(f"✅ Loaded robots.txt from {self.robots_url}")
            else:
                self.logger.info(f"⚠️  No robots.txt found at {self.robots_url} (status {response.status_code}) - assuming allow all")
                self.parser.allow_all = True
                self.initialized = True
        except Exception as e:
            self.logger.warning(f"⚠️  Failed to fetch robots.txt: {e} - assuming allow all")
            self.parser.allow_all = True
            self.initialized = True

    def can_fetch(self, user_agent: str, url: str) -> bool:
        """Check if URL is allowed for user agent"""
        if not self.initialized:
            return True # Default to allow if not initialized/failed
        return self.parser.can_fetch(user_agent, url)


# ===========================
# Data Models
# ===========================

@dataclass
class CrawlResult:
    """Result of crawling a single page"""
    url: str
    status_code: int
    title: Optional[str]
    meta_description: Optional[str] = None
    h1_tag: Optional[str] = None
    internal_links: Set[str] = None
    external_links: Set[str] = None
    error: Optional[str] = None


@dataclass
class BrokenLink:
    """A broken link discovered during crawl"""
    source_url: str
    broken_url: str
    anchor_text: str
    status_code: int
    link_type: str


# ===========================
# URL Normalizer
# ===========================

class URLNormalizer:
    """Professional URL Normalization - Industry Standard"""
    
    IGNORE_EXTENSIONS = {
        '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
        '.css', '.js', '.woff', '.woff2', '.ttf', '.eot',
        '.pdf', '.zip', '.mp4', '.mp3', '.avi', '.mov',
        '.xml', '.json'
    }
    
    AUTH_PATTERNS = [
        r'/my-account', r'/my-orders', r'/cart', r'/checkout',
        r'/wishlist', r'/dashboard', r'/order-tracking',
        r'/account', r'/login', r'/register', r'/wp-admin', r'/wp-login',
    ]
    
    IGNORE_PATTERNS = [
        r'/wp-json/', r'/wp-admin/', r'/wp-login', r'/feed/',
        r'/xmlrpc', r'\?replytocom=', r'/page/\d+/', r'\?s=',
    ]
    
    # Default index files to remove
    DEFAULT_INDEX_FILES = ['index.html', 'index.php', 'index.htm', 'default.html', 'default.htm']
    
    @staticmethod
    def normalize(url: str, base_domain: str) -> Optional[str]:
        """
        Professional URL normalization - Industry Standard
        
        Rules applied:
        1. Remove query parameters (everything after ?)
        2. Remove fragments (everything after #)
        3. Lowercase the URL
        4. Normalize trailing slash (add if missing for directories)
        5. Remove default index files (index.html, index.php, etc.)
        6. Remove www. for consistency
        """
        if not url or not url.strip():
            return None
            
        url = url.strip()
        
        try:
            parsed = urlparse(url)
            # STRICT FILTER: Only allow http and https
            if parsed.scheme and parsed.scheme.lower() not in ['http', 'https']:
                return None
        except Exception:
            return None
        
        # Get path and lowercase it
        path = parsed.path.lower()
        
        # Check auth patterns (skip these URLs)
        for pattern in URLNormalizer.AUTH_PATTERNS:
            if re.search(pattern, path):
                return None
        
        # Remove query params and fragments (RULE 1 & 2)
        parsed = parsed._replace(fragment='', query='')
        
        # Lowercase scheme and netloc (RULE 3)
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        
        # Remove www. for consistency
        if netloc.startswith('www.'):
            netloc = netloc[4:]
        
        # Remove default index files (RULE 5)
        for index_file in URLNormalizer.DEFAULT_INDEX_FILES:
            if path.endswith('/' + index_file):
                path = path[:-len(index_file)]
                break
            elif path.endswith(index_file) and path != '/' + index_file:
                path = path[:-len(index_file)]
                break
        
        # Normalize trailing slash (RULE 4)
        # Add trailing slash for directories (no file extension)
        if path and not path.endswith('/'):
            # Check if it's a file (has extension) or directory
            last_segment = path.split('/')[-1]
            if '.' not in last_segment:
                # It's a directory, add trailing slash
                path = path + '/'
        
        # Remove trailing slash from root
        if path == '//':
            path = '/'
        
        # Check file extensions (skip assets)
        ext = path.lower().split('.')[-1] if '.' in path else ''
        if f'.{ext}' in URLNormalizer.IGNORE_EXTENSIONS:
            return None
        
        # Check ignore patterns
        for pattern in URLNormalizer.IGNORE_PATTERNS:
            if re.search(pattern, path):
                return None
        
        # Reconstruct URL
        parsed = parsed._replace(scheme=scheme, netloc=netloc, path=path)
        url = urlunparse(parsed)
        
        return url
    
    @staticmethod
    def extract_canonical(html: str) -> Optional[str]:
        """
        Extract canonical URL from HTML - Industry Standard
        
        Looks for: <link rel="canonical" href="...">
        This is what Google uses to determine the preferred URL
        """
        if not html:
            return None
        
        try:
            # Look for canonical tag
            match = re.search(r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']', html, re.IGNORECASE)
            if not match:
                # Try alternate format: href before rel
                match = re.search(r'<link\s+href=["\']([^"\']+)["\']\s+rel=["\']canonical["\']', html, re.IGNORECASE)
            
            if match:
                canonical_url = match.group(1).strip()
                return canonical_url if canonical_url else None
        except Exception:
            pass
        
        return None
    
    @staticmethod
    def is_internal(url: str, base_domain: str) -> bool:
        """Check if URL belongs to base domain"""
        parsed = urlparse(url)
        if not parsed.netloc:
            return True
        
        netloc = parsed.netloc.lower().replace('www.', '')
        base = base_domain.lower().replace('www.', '')
        
        # STRICT: Exact match only. Subdomains (blog.x.com) are external.
        return netloc == base


# ===========================
# Browser Crawler
# ===========================

# [COMMENTED OUT FOR DEPLOYMENT]
# class BrowserCrawler:
#     """Headless browser crawler using Playwright - bypasses Cloudflare with stealth mode"""
#     
#     def __init__(self, num_browsers: int = 5):
#         self.browsers: List[Browser] = []
#         self.contexts: List[BrowserContext] = []
#         self.playwright = None
#         self.num_browsers = num_browsers
#         self.current_browser_index = 0
#     
#     async def start(self):
#         """Initialize multiple browsers for parallel crawling with stealth mode"""
#         try:
#             self.playwright = await async_playwright().start()
#             logger.info(f"🌐 Initializing {self.num_browsers} browser instances with stealth mode...")
#             
#             for i in range(self.num_browsers):
#                 # Launch browser with stealth args
#                 browser = await self.playwright.chromium.launch(
#                     headless=True,
#                     args=[
#                         '--disable-blink-features=AutomationControlled',
#                         '--disable-dev-shm-usage',
#                         '--no-sandbox',
#                         '--disable-setuid-sandbox',
#                         '--disable-web-security',
#                         '--disable-gpu',
#                         '--no-first-run',
#                         '--no-default-browser-check',
#                         '--disable-background-networking',
#                         '--disable-background-timer-throttling',
#                         '--disable-backgrounding-occluded-windows',
#                         '--disable-breakpad',
#                         '--disable-component-extensions-with-background-pages',
#                         '--disable-features=TranslateUI,BlinkGenPropertyTrees',
#                         '--disable-ipc-flooding-protection',
#                         '--disable-renderer-backgrounding',
#                         '--enable-features=NetworkService,NetworkServiceInProcess',
#                         '--force-color-profile=srgb',
#                         '--hide-scrollbars',
#                         '--metrics-recording-only',
#                         '--mute-audio',
#                     ]
#                 )
#                 
#                 # Create context with real browser fingerprint
#                 context = await browser.new_context(
#                     viewport={'width': 1920, 'height': 1080},
#                     user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
#                     locale='en-US',
#                     timezone_id='America/New_York',
#                     bypass_csp=True,
#                     ignore_https_errors=True,
#                     extra_http_headers={
#                         'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
#                         'Accept-Language': 'en-US,en;q=0.9',
#                         'Accept-Encoding': 'gzip, deflate, br',
#                         'Connection': 'keep-alive',
#                         'Upgrade-Insecure-Requests': '1',
#                         'Sec-Fetch-Dest': 'document',
#                         'Sec-Fetch-Mode': 'navigate',
#                         'Sec-Fetch-Site': 'none',
#                         'Sec-Fetch-User': '?1',
#                         'Cache-Control': 'max-age=0',
#                     }
#                 )
#                 
#                 # Block images, fonts, stylesheets for speed
#                 await context.route("**/*", lambda route: (
#                     route.abort() if route.request.resource_type in ["image", "stylesheet", "font", "media"]
#                     else route.continue_()
#                 ))
#                 
#                 # Advanced stealth scripts to hide automation
#                 await context.add_init_script("""
#                     // Remove webdriver flag
#                     Object.defineProperty(navigator, 'webdriver', {
#                         get: () => undefined
#                     });
#                     
#                     // Mock plugins
#                     Object.defineProperty(navigator, 'plugins', {
#                         get: () => [1, 2, 3, 4, 5]
#                     });
#                     
#                     // Mock languages
#                     Object.defineProperty(navigator, 'languages', {
#                         get: () => ['en-US', 'en']
#                     });
#                     
#                     // Mock permissions
#                     const originalQuery = window.navigator.permissions.query;
#                     window.navigator.permissions.query = (parameters) => (
#                         parameters.name === 'notifications' ?
#                             Promise.resolve({ state: Notification.permission }) :
#                             originalQuery(parameters)
#                     );
#                     
#                     // Mock chrome object
#                     window.chrome = {
#                         runtime: {}
#                     };
#                     
#                     // Hide automation
#                     Object.defineProperty(navigator, 'maxTouchPoints', {
#                         get: () => 1
#                     });
#                     
#                     // Mock connection
#                     Object.defineProperty(navigator, 'connection', {
#                         get: () => ({
#                             effectiveType: '4g',
#                             rtt: 100,
#                             downlink: 10,
#                             saveData: false
#                         })
#                     });
#                 """)
#                 
#                 self.browsers.append(browser)
#                 self.contexts.append(context)
#             
#             logger.info(f"✅ {self.num_browsers} stealth browsers initialized")
#         except Exception as e:
#             logger.error(f"Failed to initialize browsers: {e}")
#             raise
#     
#     async def stop(self):
#         """Close all browsers"""
#         try:
#             for context in self.contexts:
#                 await context.close()
#             for browser in self.browsers:
#                 await browser.close()
#             if self.playwright:
#                 await self.playwright.stop()
#         except Exception as e:
#             logger.error(f"Error closing browsers: {e}")
#     
#     def _get_next_context(self) -> BrowserContext:
#         """Round-robin browser selection"""
#         context = self.contexts[self.current_browser_index]
#         self.current_browser_index = (self.current_browser_index + 1) % len(self.contexts)
#         return context
#     
#     async def crawl_page(self, url: str, base_domain: str) -> Tuple[int, Optional[str], Set[str], Set[str]]:
#         """Crawl a single page using browser - FAST MODE"""
#         page = None
#         context = self._get_next_context()
#         
#         try:
#             page = await context.new_page()
#             page.set_default_timeout(3000)  # Reduced from 5s to 3s for speed
#             
#             response = await page.goto(url, wait_until='domcontentloaded', timeout=3000)  # 3s timeout
#             if not response:
#                 return 0, None, set(), set()
#             
#             status_code = response.status
#             
#             title = None
#             try:
#                 title = await page.title()
#                 if title:
#                     title = ' '.join(title.split())[:200]
#             except:
#                 pass
#             
#             internal_links = set()
#             external_links = set()
#             
#             try:
#                 links = await page.query_selector_all('a[href]')
#                 for link in links[:50]:
#                     try:
#                         href = await link.get_attribute('href')
#                         if href and not href.startswith(('javascript:', 'mailto:', 'tel:', '#')):
#                             absolute_url = urljoin(url, href)
#                             parsed = urlparse(absolute_url)
#                             link_domain = parsed.netloc.lower().replace('www.', '')
#                             
#                             if link_domain == base_domain or link_domain.endswith('.' + base_domain):
#                                 internal_links.add(absolute_url)
#                             else:
#                                 external_links.add(absolute_url)
#                     except:
#                         continue
#             except:
#                 pass
#             
#             await page.close()
#             return status_code, title, internal_links, external_links
#         
#         except Exception as e:
#             logger.debug(f"Browser crawl failed for {url}: {e}")
#             if page:
#                 try:
#                     await page.close()
#                 except:
#                     pass
#             return -1, None, set(), set()  # -1 = unknown status, signals need for retry


# ===========================
# WordPress Crawler
# ===========================

class WordPressCrawler:
    """WordPress-optimized crawler using REST API + sitemaps"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.base_domain = urlparse(base_url).netloc.lower().replace('www.', '')
        self.wp_json_url = f"{self.base_url}/wp-json/wp/v2"
        self.wp_sitemap_url = f"{self.base_url}/wp-sitemap.xml"
        self.all_urls: Set[str] = set()
    
    async def discover_all_urls(self, client: httpx.AsyncClient, progress_callback=None) -> Dict[str, Set[str]]:
        """
        Phase 1: Discover ALL URLs using WordPress-specific methods
        Returns: {
            'raw': set of raw URLs discovered,
            'normalized': set of normalized unique URLs
        }
        """
        raw_discovered = set()
        normalized_discovered = set()
        normalizer = URLNormalizer()
        
        # WordPress Sitemap (PRIMARY SOURCE)
        logger.info("📍 Discovering from WordPress sitemap...")
        if progress_callback:
            progress_callback(0, 0, 1)  # Show discovery started
        
        sitemap_urls = await self._discover_from_wp_sitemap(client)
        raw_discovered.update(sitemap_urls)
        
        # Normalize sitemap URLs
        for url in sitemap_urls:
            normalized = normalizer.normalize(url, self.base_domain)
            if normalized:
                normalized_discovered.add(normalized)
        
        logger.info(f"   ✅ Sitemap: {len(sitemap_urls)} raw URLs → {len(normalized_discovered)} unique URLs")
        
        # Show progress after sitemap discovery
        if progress_callback and len(normalized_discovered) > 0:
            progress_callback(0, 0, len(normalized_discovered))  # Show discovered count
        
        # ALWAYS use REST API (adds extra URLs like categories, tags, products, etc.)
        if len(sitemap_urls) > 0:
            logger.info("📍 Discovering from WordPress REST API...")
            api_urls = await self._discover_from_wp_api(client)
            raw_discovered.update(api_urls)
            
            # Normalize API URLs
            before_count = len(normalized_discovered)
            for url in api_urls:
                normalized = normalizer.normalize(url, self.base_domain)
                if normalized:
                    normalized_discovered.add(normalized)
            
            new_unique = len(normalized_discovered) - before_count
            logger.info(f"   ✅ REST API: {len(api_urls)} raw URLs → {new_unique} NEW unique URLs")
        
        # Discover pagination URLs for categories and tags
        logger.info("📍 Discovering pagination URLs...")
        pagination_urls = await self._discover_pagination_urls(normalized_discovered)
        if pagination_urls:
            raw_discovered.update(pagination_urls)
            
            # Normalize pagination URLs
            before_count = len(normalized_discovered)
            for url in pagination_urls:
                normalized = normalizer.normalize(url, self.base_domain)
                if normalized:
                    normalized_discovered.add(normalized)
            
            new_unique = len(normalized_discovered) - before_count
            logger.info(f"   ✅ Pagination: {len(pagination_urls)} raw URLs → {new_unique} NEW unique URLs")
        
        # Fallback: If no sitemap URLs, try REST API alone
        if len(sitemap_urls) == 0:
            logger.info("⚠️  No sitemap found, trying WordPress REST API...")
            api_urls = await self._discover_from_wp_api(client)
            raw_discovered.update(api_urls)
            
            # Normalize API URLs
            for url in api_urls:
                normalized = normalizer.normalize(url, self.base_domain)
                if normalized:
                    normalized_discovered.add(normalized)
            
            logger.info(f"   ✅ REST API: {len(api_urls)} raw URLs → {len(normalized_discovered)} unique URLs")
        
        # If STILL nothing found, crawl homepage for links (last resort)
        if len(normalized_discovered) == 0:
            logger.info("⚠️  No sitemap or API found, crawling homepage for links...")
            homepage_urls = await self._crawl_homepage_for_links(client)
            raw_discovered.update(homepage_urls)
            
            # Normalize homepage URLs
            for url in homepage_urls:
                normalized = normalizer.normalize(url, self.base_domain)
                if normalized:
                    normalized_discovered.add(normalized)
            
            logger.info(f"   ✅ Homepage: {len(homepage_urls)} raw URLs → {len(normalized_discovered)} unique URLs")
        
        # Don't add common URLs - only use discovered URLs from sitemap/API
        # Adding common URLs causes false 404s on sites that don't have them
        
        self.all_urls = normalized_discovered
        
        # Professional reporting
        duplicates_removed = len(raw_discovered) - len(normalized_discovered)
        logger.info(f"✅ DISCOVERY COMPLETE:")
        logger.info(f"   📊 Raw URLs Discovered: {len(raw_discovered)}")
        logger.info(f"   ✨ Unique Pages (normalized): {len(normalized_discovered)}")
        logger.info(f"   🗑️  Duplicates Removed: {duplicates_removed}")
        
        return {
            'raw': raw_discovered,
            'normalized': normalized_discovered
        }
    
    async def _discover_from_wp_sitemap(self, client: httpx.AsyncClient) -> Set[str]:
        """Discover URLs from WordPress sitemap - handle 403 gracefully"""
        urls = set()
        
        # Try multiple sitemap locations
        sitemap_urls_to_try = [
            f"{self.base_url}/wp-sitemap.xml",
            f"{self.base_url}/sitemap.xml",
            f"{self.base_url}/sitemap_index.xml",
        ]
        
        for sitemap_url in sitemap_urls_to_try:
            try:
                response = await client.get(sitemap_url, timeout=10.0)
                if response.status_code != 200:
                    continue
                
                root = ET.fromstring(response.content)
                ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
                sitemap_locs = root.findall('.//sm:sitemap/sm:loc', ns)
                
                # If it's a sitemap index, fetch child sitemaps
                if sitemap_locs:
                    for loc in sitemap_locs:
                        child_url = loc.text
                        if child_url:
                            sub_urls = await self._parse_sitemap(client, child_url)
                            urls.update(sub_urls)
                else:
                    # It's a regular sitemap, parse it directly
                    sub_urls = await self._parse_sitemap(client, sitemap_url)
                    urls.update(sub_urls)
                
                # If we found URLs, stop trying other locations
                if urls:
                    logger.info(f"✅ Found sitemap at {sitemap_url}")
                    break
            
            except Exception as e:
                logger.debug(f"Failed to fetch {sitemap_url}: {e}")
                continue
        
        return urls
    
    async def _parse_sitemap(self, client: httpx.AsyncClient, sitemap_url: str) -> Set[str]:
        """Parse individual sitemap"""
        urls = set()
        try:
            response = await client.get(sitemap_url, timeout=10.0)
            if response.status_code != 200:
                return urls
            
            root = ET.fromstring(response.content)
            ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
            locs = root.findall('.//sm:url/sm:loc', ns)
            
            for loc in locs:
                if loc.text:
                    urls.add(loc.text.strip())
        except Exception as e:
            logger.debug(f"Failed to parse sitemap {sitemap_url}: {e}")
        
        return urls
    
    async def _discover_from_wp_api(self, client: httpx.AsyncClient) -> Set[str]:
        """Discover URLs from WordPress REST API - ALL endpoints"""
        urls = set()
        
        # Expanded endpoint list - covers WordPress + WooCommerce + custom post types
        endpoints = [
            'posts', 'pages', 'categories', 'tags',  # Core WordPress
            'media', 'users',  # Additional WordPress
            'products', 'product_cat', 'product_tag',  # WooCommerce
            'portfolio', 'testimonials', 'team',  # Common custom post types
        ]
        
        try:
            for endpoint in endpoints:
                try:
                    logger.info(f"   Fetching {endpoint} from REST API...")
                    endpoint_urls = await self._fetch_wp_api_endpoint(client, endpoint, per_page=100)
                    if endpoint_urls:
                        urls.update(endpoint_urls)
                        logger.info(f"   ✅ {endpoint}: {len(endpoint_urls)} URLs")
                    else:
                        logger.debug(f"   ⚠️  {endpoint}: No URLs found (endpoint may not exist)")
                except Exception as e:
                    # Endpoint doesn't exist - skip silently
                    logger.debug(f"   ⚠️  {endpoint}: Not available ({e})")
                    continue
        except Exception as e:
            logger.debug(f"WordPress REST API discovery failed: {e}")
        
        return urls
    
    async def _fetch_wp_api_endpoint(self, client: httpx.AsyncClient, endpoint: str, per_page: int = 100) -> Set[str]:
        """Fetch URLs from WordPress REST API endpoint - NO LIMITS"""
        urls = set()
        page = 1
        
        try:
            while True:  # No page limit - fetch ALL pages
                url = f"{self.wp_json_url}/{endpoint}?per_page={per_page}&page={page}&_fields=link"
                response = await client.get(url, timeout=5.0)
                if response.status_code != 200:
                    break
                
                data = response.json()
                if not data:
                    break
                
                for item in data:
                    if 'link' in item:
                        urls.add(item['link'])
                
                total_pages = response.headers.get('X-WP-TotalPages', '1')
                if page >= int(total_pages):
                    break
                
                page += 1
        except Exception as e:
            logger.debug(f"Failed to fetch {endpoint}: {e}")
        
        return urls
    
    async def _crawl_homepage_for_links(self, client: httpx.AsyncClient) -> Set[str]:
        """Crawl homepage to discover links (fallback method for non-WordPress sites)"""
        urls = set()
        try:
            logger.info(f"   Fetching homepage: {self.base_url}")
            response = await client.get(self.base_url, timeout=10.0)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Extract all links
                for tag in soup.find_all('a', href=True):
                    href = tag['href'].strip()
                    if href and not href.startswith(('javascript:', 'mailto:', 'tel:', '#')):
                        absolute_url = urljoin(self.base_url, href)
                        parsed = urlparse(absolute_url)
                        link_domain = parsed.netloc.lower().replace('www.', '')
                        
                        # Only include internal links
                        if link_domain == self.base_domain or link_domain.endswith('.' + self.base_domain):
                            urls.add(absolute_url)
                
                logger.info(f"   Extracted {len(urls)} internal links from homepage")
            else:
                logger.warning(f"   Homepage returned status {response.status_code}")
        except Exception as e:
            logger.error(f"   Failed to crawl homepage: {e}")
        
        return urls
    
    async def _discover_pagination_urls(self, discovered_urls: Set[str]) -> Set[str]:
        """
        Discover pagination URLs for categories, tags, archives
        Example: /category/news/ → /category/news/page/2/, /category/news/page/3/, etc.
        """
        pagination_urls = set()
        
        # Identify category/tag/archive URLs (URLs that likely have pagination)
        paginated_base_urls = set()
        
        for url in discovered_urls:
            parsed = urlparse(url)
            path = parsed.path.lower()
            
            # Check if it's a category, tag, or archive URL
            if any(pattern in path for pattern in ['/category/', '/tag/', '/author/', '/archive/', '/blog/']):
                # This URL likely has pagination
                paginated_base_urls.add(url)
        
        # Generate pagination URLs (pages 2-10 for each base URL)
        for base_url in paginated_base_urls:
            for page_num in range(2, 11):  # Pages 2-10
                # WordPress pagination format: /category/news/page/2/
                if base_url.endswith('/'):
                    pagination_url = f"{base_url}page/{page_num}/"
                else:
                    pagination_url = f"{base_url}/page/{page_num}/"
                
                pagination_urls.add(pagination_url)
        
        logger.info(f"   Generated {len(pagination_urls)} pagination URLs from {len(paginated_base_urls)} base URLs")
        
        return pagination_urls
    
    async def validate_urls_fast(self, client: httpx.AsyncClient, urls: Set[str], 
                                 progress_callback=None, semaphore=None) -> Dict[str, Dict]:
        """
        Phase 2: Validate URLs + Extract Links (FULL DISCOVERY)
        This is the KEY to finding all pages - we extract links from validated pages
        """
        results = {}
        urls_to_process = set(urls)  # Start with discovered URLs
        processed_urls = set()  # Track what we've already validated
        broken_count = 0
        crawled_count = 0
        
        # Smaller batches for more frequent progress updates
        batch_size = 50  # Process 50 at a time
        
        # Keep processing until no new URLs are found
        iteration = 0
        max_iterations = 10  # Prevent infinite loops
        
        while urls_to_process and iteration < max_iterations:
            iteration += 1
            current_batch_urls = list(urls_to_process)[:batch_size * 10]  # Process up to 500 URLs per iteration
            urls_to_process = urls_to_process - set(current_batch_urls)
            
            logger.info(f"🔍 Iteration {iteration}: Validating {len(current_batch_urls)} URLs (queue: {len(urls_to_process)})")
            
            # Process in batches
            for i in range(0, len(current_batch_urls), batch_size):
                batch = current_batch_urls[i:i+batch_size]
                tasks = [self._validate_and_extract_links(client, url, semaphore) for url in batch]
                batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for url, result in zip(batch, batch_results):
                    if isinstance(result, dict):
                        results[url] = result
                        processed_urls.add(url)
                        crawled_count += 1
                        
                        # Count broken links (404/410)
                        status = result.get('status', 0)
                        if status in [404, 410]:
                            broken_count += 1
                        
                        # Extract links from successful pages (200 status)
                        if status == 200:
                            extracted_links = result.get('links', set())
                            
                            # Add new links to queue (only if not already processed)
                            new_links = extracted_links - processed_urls - urls_to_process
                            if new_links:
                                urls_to_process.update(new_links)
                                logger.debug(f"   📎 Extracted {len(new_links)} new links from {url}")
                
                # REAL-TIME PROGRESS: Update after each batch
                total_discovered = len(processed_urls) + len(urls_to_process)
                if progress_callback:
                    progress_callback(crawled_count, broken_count, total_discovered)
            
            logger.info(f"✅ Iteration {iteration} complete: {crawled_count} validated, {len(urls_to_process)} in queue")
        
        if iteration >= max_iterations:
            logger.warning(f"⚠️  Reached max iterations ({max_iterations}), stopping link extraction")
        
        logger.info(f"✅ Link extraction complete: {crawled_count} total pages validated")
        
        return results
    
    async def _validate_and_extract_links(self, client: httpx.AsyncClient, url: str, semaphore) -> Dict:
        """Validate URL AND extract links from it"""
        if semaphore:
            async with semaphore:
                return await self._do_validate_and_extract(client, url)
        else:
            return await self._do_validate_and_extract(client, url)
    
    async def _do_validate_and_extract(self, client: httpx.AsyncClient, url: str) -> Dict:
        """
        Validate URL + Extract internal links + Track link relationships
        Returns: {'status': 200/404, 'title': str, 'links': set(), 'outbound_links': list()}
        """
        # First validate the URL
        result = await self._do_validate(client, url)
        
        # If page is working (200), extract links from it
        if result.get('status') == 200:
            try:
                # Fetch page content
                response = await client.get(url, timeout=3.0, follow_redirects=True)
                if response.status_code == 200:
                    html = response.text
                    
                    # Extract links using BeautifulSoup
                    soup = BeautifulSoup(html, 'html.parser')
                    extracted_links = set()
                    outbound_links = []  # Track all links with anchor text for broken link detection
                    
                    for tag in soup.find_all('a', href=True):
                        href = tag['href'].strip()
                        if href and not href.startswith(('javascript:', 'mailto:', 'tel:', '#')):
                            # Get anchor text
                            anchor_text = tag.get_text(strip=True)[:200] if tag.get_text(strip=True) else href
                            
                            # Convert to absolute URL
                            absolute_url = urljoin(url, href)
                            
                            # Normalize the URL
                            normalized = URLNormalizer.normalize(absolute_url, self.base_domain)
                            
                            # Track ALL outbound links (for broken link detection)
                            if normalized:
                                outbound_links.append({
                                    'url': normalized,
                                    'anchor_text': anchor_text,
                                    'is_internal': URLNormalizer.is_internal(normalized, self.base_domain)
                                })
                                
                                # Only add internal links to crawl queue
                                if URLNormalizer.is_internal(normalized, self.base_domain):
                                    extracted_links.add(normalized)
                    
                    result['links'] = extracted_links
                    result['outbound_links'] = outbound_links  # Store for broken link detection
                    
                    if extracted_links:
                        logger.debug(f"   📎 Extracted {len(extracted_links)} internal links from {url}")
            except Exception as e:
                logger.debug(f"   ⚠️  Failed to extract links from {url}: {e}")
                result['links'] = set()
                result['outbound_links'] = []
        else:
            result['links'] = set()
            result['outbound_links'] = []
        
        return result
    
    async def _validate_url(self, client: httpx.AsyncClient, url: str, semaphore) -> Dict:
        """Validate single URL using HEAD request"""
        if semaphore:
            async with semaphore:
                return await self._do_validate(client, url)
        else:
            return await self._do_validate(client, url)
    
    def _generate_title_from_url(self, url: str) -> str:
        """
        Generate clean title from URL path
        Takes only the LAST segment of the path for clean titles
        Example: /product/boho-bangle-bracelet → Boho Bangle Bracelet
        """
        from urllib.parse import unquote, urlparse
        
        path = urlparse(url).path.strip('/')
        if not path:
            return 'Home Page'
        
        # Take only the LAST part of the path (the actual page name)
        page_name = path.split('/')[-1]
        
        # Clean up the page name
        title = unquote(page_name).replace('-', ' ').replace('_', ' ').title()
        
        # Limit length
        if len(title) > 100:
            title = title[:100] + '...'
        
        return title if title else 'Home Page'
    
    def _extract_page_metadata(self, html: str, url: str) -> tuple[str, bool]:
        """Extract title and check for noindex meta tag"""
        title = None
        is_noindex = False
        
        if html:
            match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
            if match:
                title = ' '.join(match.group(1).strip().split())[:200]
            
            if not title:
                og_match = re.search(r'<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']', html, re.IGNORECASE)
                if og_match:
                    title = ' '.join(og_match.group(1).strip().split())[:200]
                    
            if "noindex" in html.lower():
                soup = BeautifulSoup(html, 'html.parser')
                robots_meta = soup.find('meta', attrs={'name': lambda x: x and str(x).lower() in ['robots', 'googlebot', 'bingbot']})
                if robots_meta and robots_meta.get('content') and 'noindex' in str(robots_meta.get('content')).lower():
                    is_noindex = True

        if not title:
            title = self._generate_title_from_url(url)
            
        return title, is_noindex
        
    async def _do_validate(self, client: httpx.AsyncClient, url: str) -> Dict:
        """
        FAST + ACCURATE validation: ONLY returns 200 or 404
        CRITICAL: Never falsely mark working pages as 404
        Strategy: Retry aggressively to avoid false positives
        """
        max_attempts = 5  # Keep trying to avoid false 404s
        timeouts = [2.0, 4.0, 6.0, 8.0, 12.0]  # Progressive timeouts (balanced speed + accuracy)
        
        for attempt in range(max_attempts):
            try:
                timeout_val = timeouts[min(attempt, len(timeouts) - 1)]
                
                # Try HEAD first (fast)
                response = await client.head(url, timeout=timeout_val, follow_redirects=True)
                status = response.status_code
                
                # Handle different status codes
                if status == 200:
                    # CONFIRMED WORKING - get title
                    try:
                        get_response = await client.get(url, timeout=timeout_val, follow_redirects=True)
                        html = get_response.text[:8000]
                        
                        title, is_noindex = self._extract_page_metadata(html, url)
                        return {'status': 200, 'title': title, 'is_noindex': is_noindex}
                    except:
                        title = self._generate_title_from_url(url)
                        return {'status': 200, 'title': title, 'is_noindex': False}
                
                elif status in [404, 410]:
                    # CONFIRMED BROKEN - but verify with GET to be 100% sure
                    try:
                        get_response = await client.get(url, timeout=timeout_val, follow_redirects=True)
                        final_status = get_response.status_code
                        
                        if final_status == 200:
                            # FALSE ALARM! HEAD said 404 but GET says 200
                            # Some servers return wrong status for HEAD
                            html = get_response.text[:8000]
                            title, is_noindex = self._extract_page_metadata(html, url)
                            return {'status': 200, 'title': title, 'is_noindex': is_noindex}
                        elif final_status in [404, 410]:
                            # CONFIRMED 404 with GET - definitely broken
                            return {'status': 404, 'title': None}
                        else:
                            # Got different status - retry
                            await asyncio.sleep(1.0)
                            continue
                    except:
                        # GET failed but HEAD said 404 - assume 404
                        return {'status': 404, 'title': None}
                
                elif status == 405:
                    # HEAD not allowed, try GET
                    get_response = await client.get(url, timeout=timeout_val, follow_redirects=True)
                    status = get_response.status_code
                    
                    if status == 200:
                        html = get_response.text[:8000]
                        title, is_noindex = self._extract_page_metadata(html, url)
                        return {'status': 200, 'title': title, 'is_noindex': is_noindex}
                    elif status in [404, 410]:
                        return {'status': 404, 'title': None}
                    else:
                        # Other status - retry
                        await asyncio.sleep(0.5)
                        continue
                
                elif status in [301, 302, 307, 308]:
                    # Redirects - httpx follows them, so this means redirect worked
                    # Treat as 200 (working page)
                    title = self._generate_title_from_url(url)
                    return {'status': 200, 'title': title, 'is_noindex': False}
                
                elif status in [403, 401]:
                    # Auth required or forbidden - but page EXISTS
                    # This is NOT a 404, it's a working page that needs auth
                    # Treat as 200 (page exists)
                    title = self._generate_title_from_url(url)
                    return {'status': 200, 'title': title, 'is_noindex': False}
                
                elif status == 429:
                    # Rate limited - DEFINITELY not a 404, page exists
                    # Wait longer and retry
                    logger.debug(f"Rate limited on {url}, waiting...")
                    await asyncio.sleep(3.0 * (attempt + 1))  # Long wait for rate limit
                    continue
                
                elif status >= 500:
                    # Server error - page might exist, server is just having issues
                    # RETRY - don't assume 404
                    logger.debug(f"Server error {status} on {url}, retrying...")
                    await asyncio.sleep(2.0)
                    continue
                
                else:
                    # Any other status (2xx, 3xx) - treat as working
                    title = self._generate_title_from_url(url)
                    return {'status': 200, 'title': title, 'is_noindex': False}
            
            except (httpx.TimeoutException, httpx.ConnectTimeout, httpx.ReadTimeout):
                # Timeout - page might exist, just slow
                # RETRY with longer timeout - don't assume 404
                if attempt < max_attempts - 1:
                    logger.debug(f"Timeout on {url} (attempt {attempt + 1}/{max_attempts}), retrying...")
                    await asyncio.sleep(0.5)
                    continue
                else:
                    # Final timeout - assume 200 (page exists but slow)
                    # NEVER assume 404 on timeout - that would be inaccurate
                    logger.debug(f"Final timeout on {url}, assuming 200 (slow page)")
                    title = self._generate_title_from_url(url)
                    return {'status': 200, 'title': title, 'is_noindex': False}
            
            except Exception as e:
                # Other errors - retry
                if attempt < max_attempts - 1:
                    logger.debug(f"Error on {url}: {e}, retrying...")
                    await asyncio.sleep(0.5)
                    continue
                else:
                    # Final error - assume 200 (better safe than false positive)
                    logger.debug(f"Final error on {url}, assuming 200")
                    title = self._generate_title_from_url(url)
                    return {'status': 200, 'title': title, 'is_noindex': False}
        
        # After all retries, assume 200 (NEVER falsely mark as 404)
        logger.debug(f"Could not validate {url} after {max_attempts} attempts, assuming 200 (safe default)")
        title = self._generate_title_from_url(url)
        return {'status': 200, 'title': title, 'is_noindex': False}


# ===========================
# Custom HTTP Crawler (Base)
# ===========================

class CustomCrawler:
    """Production-grade async HTTP crawler - 2-phase architecture"""
    
    def __init__(self, start_url: str, max_pages: int = 1000, concurrent_requests: int = 1000,
                 requests_per_second: float = 100.0, scan_id: Optional[str] = None,
                 scan_status: Optional[Any] = None, resume: bool = False, site_id: Optional[str] = None):
        self.start_url = start_url if start_url.startswith('http') else 'https://' + start_url
        self.max_pages = max_pages
        self.concurrent_requests = concurrent_requests
        self.scan_id = scan_id
        self.scan_status = scan_status
        self.resume = resume
        self.site_id = site_id
        
        parsed = urlparse(self.start_url)
        self.base_domain = parsed.netloc.lower().replace('www.', '')
        
        self.rate_limiter = DomainRateLimiter(requests_per_second)
        
        self.discovered_urls: Set[str] = set()
        self.crawled_urls: Set[str] = set()
        self.to_crawl: Set[str] = set()
        self.pages: Dict[str, Dict] = {}
        self.broken_links: List[BrokenLink] = []
        
        # Track anchor text and source for each link
        # Format: {url: {'anchor_text': str, 'source_url': str}}
        self.link_metadata: Dict[str, Dict[str, str]] = {}
        
        self.total_discovered = 0
        self.total_crawled = 0
        
        self.supabase = None
        self.pending_db_writes: List[Dict] = []
        self.last_db_flush = time.time()
        self.db_flush_interval = 10.0
        self.db_batch_size = 200
    
    def _get_supabase(self):
        """Lazy load supabase connection"""
        if self.supabase is None:
            from app.database import get_supabase
            self.supabase = get_supabase()
        return self.supabase
    
    async def _persist_url_state(self, url: str, state: str, status_code: int = None, error: str = None):
        """Persist URL state to database (batched)"""
        if not self.scan_id:
            return
        
        data = {
            'scan_id': self.scan_id,
            'site_id': self.site_id or self.base_domain,
            'url': url,
            'state': state
        }
        
        if status_code is not None:
            data['status_code'] = status_code
        if error is not None:
            data['error_message'] = error
        if state in ['done', 'skipped', 'blocked']:
            data['completed_at'] = datetime.now().isoformat()
        
        self.pending_db_writes.append(data)
        
        now = time.time()
        if len(self.pending_db_writes) >= self.db_batch_size or (now - self.last_db_flush) >= self.db_flush_interval:
            await self._flush_db_writes()
    
    async def _flush_db_writes(self):
        """Flush pending database writes"""
        if not self.pending_db_writes:
            return
        
        try:
            supabase = self._get_supabase()
            while self.pending_db_writes:
                batch = self.pending_db_writes[:self.db_batch_size]
                self.pending_db_writes = self.pending_db_writes[self.db_batch_size:]
                
                if batch:
                    supabase.table("crawl_queue").upsert(batch, on_conflict="scan_id,url").execute()
            
            self.last_db_flush = time.time()
        except Exception as e:
            logger.error(f"Error flushing database writes: {e}")
    
    async def crawl(self, progress_callback=None):
        """Main crawl method - implemented by subclasses"""
        raise NotImplementedError("Subclasses must implement crawl()")


# ===========================
# Professional SEO Crawler
# ===========================

class ProfessionalCrawler(CustomCrawler):
    """
    Professional-grade SEO Crawler
    Features:
    - Queue-based architecture (infinite depth)
    - Strict Binary Validation (200 vs 404)
    - Intelligent Retries (Browser/Proxy)
    - Full Link Discovery
    - Gentle crawling (50 concurrent to avoid overwhelming weak hosts)
    """
    
    def __init__(self, start_url: str, max_pages: int = 1000, concurrent_requests: int = 5,  # Moderate speed
                 requests_per_second: float = 3.0,  # 3 requests per second for better speed
                 scan_id: Optional[str] = None,
                 scan_status: Optional[Any] = None, resume: bool = False, site_id: Optional[str] = None):
        # Call parent with adjusted concurrency
        super().__init__(start_url=start_url, max_pages=max_pages, 
                         concurrent_requests=concurrent_requests,
                         requests_per_second=requests_per_second,
                         scan_id=scan_id, scan_status=scan_status, 
                         resume=resume, site_id=site_id)
        self.robots_parser = None
        # self.browser_crawler: Optional[BrowserCrawler] = None  # Disabled for non-Docker deployment
        self.browser_crawler = None
        self.queue = asyncio.Queue()
        self.processed_count = 0
        self.broken_count = 0
        self.retry_count = defaultdict(int)
        self.max_retries = 3
        
        # === CIRCUIT BREAKER STATE ===
        self.circuit_breaker_open = False  # True = server is down, pause all requests
        self.server_error_count = 0  # Count of 503/5xx errors
        self.server_error_threshold = 3  # Open circuit after 3 consecutive errors
        self.circuit_breaker_lock = asyncio.Lock()
        self.active_workers = 0  # Track how many workers are running
        self.current_concurrency = concurrent_requests  # Can be reduced dynamically
        self.server_was_unstable = False  # Track if ANY 503 occurred during scan
        self.uncertain_urls: Set[str] = set()  # URLs that failed during server instability
        self.browser_lock = asyncio.Lock()  # Lock for browser initialization
        self.latencies: List[float] = [] # Track recent latencies for adaptive speed

        # === PROGRESS TUNING ===
        self.next_progress_threshold = random.randint(3, 8)
    
    async def _check_circuit_breaker(self) -> bool:
        """Check if circuit breaker is open. If open, wait for recovery."""
        if not self.circuit_breaker_open:
            return True  # OK to proceed
        
        # Wait for circuit to close
        while self.circuit_breaker_open:
            logger.info("⏸ Circuit breaker OPEN - waiting for server recovery...")
            await asyncio.sleep(5.0)
        
        return True
    
    async def _trip_circuit_breaker(self):
        """Trip circuit breaker - server is overloaded, pause ALL workers"""
        async with self.circuit_breaker_lock:
            if self.circuit_breaker_open:
                return  # Already open
            
            self.circuit_breaker_open = True
            self.server_was_unstable = True
            
            # Reduce concurrency for future requests
            old_concurrency = self.current_concurrency
            self.current_concurrency = max(5, self.current_concurrency // 2)  # Halve it, minimum 5
            
            logger.warning(f"🚨 CIRCUIT BREAKER TRIPPED! Server overloaded.")
            logger.warning(f"   Reducing concurrency: {old_concurrency} → {self.current_concurrency}")
            logger.warning(f"   Pausing ALL workers for 120 seconds (Deep Sleep)...")
            
            # Wait for server to recover - PLAY IT SAFE
            await asyncio.sleep(120.0)
            
            # Drop RPS to ultra-slow restart
            self.rate_limiter.requests_per_second = 0.2 # 1 request every 5 seconds
            logger.info("🐢 Restarting at ultra-slow speed (0.2 req/s)")
            
            # Test if server is back
            logger.info("🔄 Testing server recovery...")
            self.circuit_breaker_open = False
            self.server_error_count = 0
            logger.info("✅ Circuit breaker CLOSED - resuming with reduced concurrency")
    
    async def _record_server_error(self, url: str):
        """Record server error (503/5xx). Trip circuit breaker if threshold exceeded."""
        async with self.circuit_breaker_lock:
            self.server_error_count += 1
            self.uncertain_urls.add(url)
            
            if self.server_error_count >= self.server_error_threshold:
                # Trip the circuit breaker
                await self._trip_circuit_breaker()
    
    async def _record_success(self):
        """Record successful request - reset error count"""
        async with self.circuit_breaker_lock:
            self.server_error_count = 0
    
    def _generate_title_from_url(self, url: str) -> str:
        """Generate clean title from URL path"""
        from urllib.parse import unquote, urlparse
        
        path = urlparse(url).path.strip('/')
        if not path:
            return 'Home Page'
        
        page_name = path.split('/')[-1]
        title = unquote(page_name).replace('-', ' ').replace('_', ' ').title()
        
        if len(title) > 100:
            title = title[:100] + '...'
        
        return title if title else 'Home Page'
    
    async def crawl(self, progress_callback=None):
        """Main crawl loop"""
        # 1. Initialize
        if progress_callback:
            progress_callback(0, 0, 1)
        
        # Configure client with generous timeouts and browser-like headers
        limits = httpx.Limits(max_keepalive_connections=self.concurrent_requests, max_connections=self.concurrent_requests)
        timeout = httpx.Timeout(30.0, connect=10.0)  # 30s total, 10s connect
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, limits=limits, headers=headers) as client:
            # 2. Check Robots.txt
            self.robots_parser = RobotsParser(self.start_url)
            await self.robots_parser.fetch(client)
            
            # 3. Discovery Phase (Sitemaps + APIs)
            logger.info("📍 Starting Discovery Phase...")
            discovery_urls = await self._initial_discovery(client)
            for url in discovery_urls:
                # Store tuple (url, source) in queue
                await self.queue.put((url, "DISCOVERY")) 
                self.discovered_urls.add(url)
                
            logger.info(f"📊 Initial Discovery: {len(discovery_urls)} URLs")
            
            # 4. Processing Phase (Worker Pool)
            # Use configured concurrency
            worker_count = min(self.concurrent_requests, 2000) # Cap at 2000 for safety
            logger.info(f"🔥 Spawning {worker_count} workers (Target: {self.max_pages} pages)...")
            workers = [self._worker(client, progress_callback) for _ in range(worker_count)]
            await asyncio.gather(*workers)
            
            # 5. Cleanup
            if self.browser_crawler:
                await self.browser_crawler.stop()
                
            # Final Callback
            if progress_callback:
                progress_callback(self.processed_count, self.broken_count, len(self.discovered_urls))
                
    async def _worker(self, client: httpx.AsyncClient, progress_callback):
        """Worker to process URLs from queue"""
        while True:
            # Check Max Pages
            if self.processed_count >= self.max_pages:
                break
            
            # === CHECK CIRCUIT BREAKER ===
            await self._check_circuit_breaker()
                
            try:
                # Get next URL with timeout (to exit if empty for a while)
                try:
                    # Reduced to 5.0s for faster completion when queue is empty
                    item = await asyncio.wait_for(self.queue.get(), timeout=5.0) 
                except asyncio.TimeoutError:
                    if self.queue.empty():
                        break
                    continue
                
                # Unpack tuple from queue
                if isinstance(item, tuple):
                    url, source_url = item
                else:
                    url, source_url = item, "UNKNOWN"
                
                if url in self.crawled_urls:
                    self.queue.task_done()
                    continue
                    
                # Process
                await self._process_url(client, url, source_url)
                
                # Update Stats
                self.queue.task_done()
                
                # Progress Update (Organic 3-8 page variations for fluid but performant UX)
                if self.processed_count >= self.next_progress_threshold and progress_callback:
                    progress_callback(self.processed_count, self.broken_count, len(self.discovered_urls))
                    self.next_progress_threshold = self.processed_count + random.randint(3, 8)
                    
            except Exception as e:
                logger.error(f"Worker Error: {e}")
                
    async def _process_url(self, client: httpx.AsyncClient, url: str, source_url: str = "UNKNOWN"):
        """Fetch, Validate, and Extract"""
        # Rate Limiting
        await self.rate_limiter.wait_if_needed(self.base_domain)
        
        self.crawled_urls.add(url)
        self.processed_count += 1
        
        start_time = time.time()
        
        # 1. Validate (Strict Binary)
        status, content, content_type, title, description, h1 = await self._validate_binary(client, url)
        
        latency = time.time() - start_time
        self._record_latency(latency, status)
        
        # Check for noindex
        is_noindex = False
        if content and 'noindex' in content.lower():
            soup = BeautifulSoup(content, 'html.parser')
            robots_meta = soup.find('meta', attrs={'name': lambda x: x and str(x).lower() in ['robots', 'googlebot', 'bingbot']})
            if robots_meta and robots_meta.get('content') and 'noindex' in str(robots_meta.get('content')).lower():
                is_noindex = True

        # 2. Record Result
        result_data = {
            'url': url,
            'status': status,
            'title': title,
            'description': description,
            'h1': h1,
            'content_type': content_type,
            'is_noindex': is_noindex,
            'internal_links': set(),
            'external_links': set(), # TODO: Populate if needed
            'meta': {}
        }
        
        # 3. Handle Result
        if status == 404:
            self.broken_count += 1
            self.pages[url] = result_data
            
            # Determine if this is an internal or external 404
            is_internal = URLNormalizer.is_internal(url, self.base_domain)
            link_type = "internal_404" if is_internal else "external_404"
            
            # Get anchor text from metadata if available
            metadata = self.link_metadata.get(url, {})
            anchor_text = metadata.get('anchor_text', '[No Anchor Text]')
            # If source_url from metadata is available, use it; otherwise use the passed source_url
            actual_source_url = metadata.get('source_url', source_url)
            
            self.broken_links.append(BrokenLink(
                source_url=actual_source_url,
                broken_url=url,
                anchor_text=anchor_text,
                status_code=404,
                link_type=link_type
            ))
            
            await self._persist_url_state(url, 'done', 404, "Broken Link")
            return
            
        # 4. Success (200) - Extract Links
        await self._persist_url_state(url, 'done', status, None)
        
        # Only extract from HTML AND only if internal
        is_internal = URLNormalizer.is_internal(url, self.base_domain)
        
        if is_internal and content and 'text/html' in content_type:
            link_data_list = self._extract_links(url, content)
            
            # Separate internal/external and extract URLs
            internal_urls = set()
            external_urls = set()
            
            for link_data in link_data_list:
                link_url = link_data['url']
                anchor_text = link_data['anchor_text']
                is_link_internal = link_data['is_internal']
                
                # Store metadata for this link
                if link_url not in self.link_metadata:
                    self.link_metadata[link_url] = {
                        'anchor_text': anchor_text,
                        'source_url': url
                    }
                
                # Categorize as internal or external
                if is_link_internal:
                    internal_urls.add(link_url)
                else:
                    external_urls.add(link_url)
            
            logger.debug(f"   Analysis for {url}: {len(internal_urls)} Internal, {len(external_urls)} External")
            
            result_data['internal_links'] = internal_urls
            result_data['external_links'] = external_urls
            self.pages[url] = result_data 
            
            # Add new links to queue
            all_urls = internal_urls | external_urls
            for link_url in all_urls:
                if link_url not in self.discovered_urls and link_url not in self.crawled_urls:
                    # Check robots for internal only
                    should_add = False
                    if URLNormalizer.is_internal(link_url, self.base_domain):
                        if self.robots_parser.can_fetch("*", link_url):
                            should_add = True
                    else:
                        # Always add external links for validation
                        should_add = True
                        
                    if should_add:
                        self.discovered_urls.add(link_url)
                        await self.queue.put((link_url, url)) # Pass current URL as source
        else:
            self.pages[url] = result_data
            if is_internal:
                logger.debug(f"   Skip extract {url}: content={bool(content)}, type={content_type}")

    def _record_latency(self, latency: float, status: int):
        """Adaptive speed control logic"""
        self.latencies.append(latency)
        if len(self.latencies) > 20:
            self.latencies.pop(0)
            
        # ⚠ CRITICAL: If server is struggling (503 or extreme slowdown), SLOW DOWN IMMEDIATELY
        if status == 503 or latency > 4.0:
            self.rate_limiter.requests_per_second = max(0.5, self.rate_limiter.requests_per_second * 0.5)
            logger.warning(f"📉 Server struggling ({status}/{latency:.2f}s) - Throttling speed to {self.rate_limiter.requests_per_second:.1f} req/s")
            self.latencies.clear() # Reset window after major slowdown
            
        # 📈 If server is humming along, SPEED UP GRADUALLY
        elif len(self.latencies) >= 10 and all(l < 0.6 for l in self.latencies[-10:]):
            # If last 10 requests were < 600ms, increase RPS
            old_rps = self.rate_limiter.requests_per_second
            new_rps = min(10.0, old_rps + 0.5) # Cap at 10 req/s for safety
            if new_rps > old_rps:
                self.rate_limiter.requests_per_second = new_rps
                logger.info(f"🚀 Server is fast! Scaling speed to {new_rps:.1f} req/s")
                self.latencies.clear() # Reset window after speedup

    # Soft 404 detection patterns - only strong signals
    SOFT_404_PATTERNS = [
        re.compile(r'<title[^>]*>[^<]*(404|not found)[^<]*</title>', re.IGNORECASE),
        re.compile(r'<h1[^>]*>[^<]*(page not found|404 error|404 –)[^<]*</h1>', re.IGNORECASE),
        re.compile(r'class="[^"]*error-404[^"]*"', re.IGNORECASE),  # WordPress error class
    ]
    
    def _is_soft_404(self, content: str) -> bool:
        """Check if page is a soft 404 (returns 200 but shows error page)"""
        if not content:
            return False
        # Only check first 2000 chars for performance
        snippet = content[:2000]
        for pattern in self.SOFT_404_PATTERNS:
            if pattern.search(snippet):
                return True
        return False
    
    async def _validate_binary(self, client: httpx.AsyncClient, url: str) -> Tuple[int, Optional[str], str, Optional[str], Optional[str], Optional[str]]:
        """
        STRICT BINARY VALIDATION - NEVER FALSE 404
        Returns: (Status [200|404], Content, Content-Type, Title)
        
        Philosophy: Only return 404 if server EXPLICITLY confirms it.
        If uncertain, assume 200 (page exists) to avoid false positives.
        """
        title = None
        got_explicit_404 = False  # True only if server returned real 404/410 status
        is_external = not URLNormalizer.is_internal(url, self.base_domain)

        # Short-link / JS-redirect domains: these return HTTP 404 but work in browsers
        # via JavaScript redirects. Skip validation and treat as working (200).
        JS_REDIRECT_DOMAINS = {
            'goo.gl', 'maps.app.goo.gl', 'bit.ly', 'tinyurl.com',
            't.co', 'ow.ly', 'buff.ly', 'short.io', 'rb.gy',
            'cutt.ly', 'is.gd', 'v.gd', 'tiny.cc', 'lnkd.in',
            'amzn.to', 'youtu.be', 'fb.me', 'wa.me',
        }
        parsed_host = urlparse(url).netloc.lower().replace('www.', '')
        if parsed_host in JS_REDIRECT_DOMAINS:
            logger.debug(f"[VALIDATE] Short-link domain {parsed_host} — skipping, assuming 200: {url}")
            return 200, None, 'text/html', self._generate_title_from_url(url), None, None

        # Progressive timeout strategy for slow WordPress sites
        # MODERATE timeouts - fail faster on broken links but allow some slowness
        TIMEOUTS = [8.0, 15.0, 30.0]  # Reduced from 10/20/45
        
        logger.debug(f"[VALIDATE] Starting validation for: {url}")
        
        # Attempt 1: Fast HTTP HEAD
        try:
            # Skip HEAD for likely HTML pages to save a round trip
            looks_like_page = not any(url.lower().endswith(ext) for ext in ['.pdf', '.jpg', '.png', '.zip', '.exe'])
            if looks_like_page:
                logger.debug(f"[VALIDATE] Skipping HEAD for likely page: {url}")
                pass
            else:
                resp = await client.head(url, timeout=3.0)  # Fast initial probe for assets
                logger.debug(f"[VALIDATE] HEAD returned {resp.status_code} for {url}")
                
                if resp.status_code == 200:
                    # Need GET for title/content - continue below
                    logger.info(f"[VALIDATE] HEAD=200, will do GET for content")
                    pass
                elif resp.status_code == 404:
                    # HEAD says 404 - CONFIRM with GET (some servers lie on HEAD)
                    logger.info(f"[VALIDATE] HEAD=404, confirming with GET...")
                    try:
                        resp_get = await client.get(url, timeout=5.0)
                        logger.info(f"[VALIDATE] Confirm GET returned {resp_get.status_code}")
                        if resp_get.status_code == 404:
                            logger.info(f"✗ CONFIRMED 404 (HEAD+GET both 404): {url}")
                            return 404, None, '', None, None, None
                        elif resp_get.status_code == 200:
                            # Server lied on HEAD! Page actually works
                            logger.info(f"✓ HEAD lied, GET says 200: {url}")
                            content = resp_get.text
                            title = self._extract_title(content)
                            description = self._extract_description(content)
                            return 200, content, resp_get.headers.get('content-type', ''), title, description, None
                        else:
                            logger.info(f"[VALIDATE] Confirm GET returned unexpected {resp_get.status_code}")
                    except Exception as e:
                        logger.info(f"[VALIDATE] Confirm GET failed: {type(e).__name__}: {e}")
                        pass  # GET failed, continue to retry loop
                elif resp.status_code == 503:
                    logger.warning(f"[VALIDATE] HEAD got 503 - server overloaded!")
                else:
                    logger.info(f"[VALIDATE] HEAD returned {resp.status_code}, continuing to GET")
        except Exception as e:
            logger.info(f"[VALIDATE] HEAD failed: {type(e).__name__}: {e}")
            pass  # HEAD failed, continue to retry loop
            
        # Attempt 2: Strong HTTP GET with progressive timeouts
        for attempt, timeout in enumerate(TIMEOUTS):
            try:
                resp = await client.get(url, timeout=timeout)
                
                if resp.status_code == 200:
                    content = resp.text
                    
                    # Check Soft 404 (page shows error but returns 200)
                    # SKIP for external URLs: Cloudflare/WAF challenge pages can look like errors
                    if not is_external and self._is_soft_404(content):
                        logger.info(f"✗ SOFT 404 detected: {url}")
                        return 404, None, '', None, None, None
                    
                    # SUCCESS! Reset circuit breaker error count
                    await self._record_success()
                    
                    # Extract Title, Description, and H1
                    title = self._extract_title(content)
                    description = self._extract_description(content)
                    h1 = self._extract_h1(content)
                    logger.debug(f"✓ Confirmed 200: {url}")
                    return 200, content, resp.headers.get('content-type', ''), title, description, h1
                
                elif resp.status_code in [404, 410]:
                    logger.info(f"✗ CONFIRMED 404: {url}")
                    got_explicit_404 = True
                    return 404, None, '', None, None, None
                
                elif resp.status_code == 429:  # Rate limited
                    logger.debug(f"Rate limited on {url}, waiting...")
                    await asyncio.sleep(3.0 * (attempt + 1))
                    continue
                
                elif resp.status_code == 503:  # Server overloaded
                    # FREE WORDPRESS HOSTING - server can't handle load
                    # This is NOT a 404! Trigger circuit breaker
                    logger.warning(f"⚠ Server overloaded (503) on {url}")
                    await self._record_server_error(url)
                    await asyncio.sleep(5.0 * (attempt + 1))
                    continue
                
                elif resp.status_code >= 500:  # Other server errors
                    logger.debug(f"Server error {resp.status_code} on {url}, retrying...")
                    await self._record_server_error(url)
                    await asyncio.sleep(2.0 * (attempt + 1))
                    continue
                
                elif resp.status_code in [301, 302, 307, 308]:  # Redirect (should auto-follow)
                    # If we get here, redirect worked - treat as 200
                    return 200, None, '', self._generate_title_from_url(url), None, None
                
                elif resp.status_code in [401, 403]:  # Auth/Forbidden - page EXISTS
                    logger.debug(f"Auth required for {url}, assuming 200")
                    return 200, None, '', self._generate_title_from_url(url), None, None
                
                else:
                    # Unknown status - retry
                    await asyncio.sleep(1.0 * (attempt + 1))
                    
            except Exception as e:
                logger.warning(f"[VALIDATE] GET attempt {attempt+1} FAILED for {url}: {type(e).__name__}: {e}")
                await asyncio.sleep(1.0 * (attempt + 1))
                
        logger.debug(f"[VALIDATE] All GET attempts exhausted, skipping browser fallback (Disabled for deployment)...")
        
        # FINAL VERDICT: If all attempts failed with network errors (not explicit 404),
        # assume 200 — the page likely exists but is blocking our crawler (Cloudflare, WAF, etc.)
        # Only mark as 404 if the server explicitly returned 404/410.
        if got_explicit_404:
            logger.error(f"[VALIDATE] ❌ FINAL: Confirmed 404 for {url}")
            return 404, None, "", None, None, None
        else:
            logger.warning(f"[VALIDATE] ⚠ All attempts failed for {url} (network/timeout/block) - assuming 200 to avoid false positive")
            title = self._generate_title_from_url(url)
            return 200, None, 'text/html', title, None, None
    
    def _extract_title(self, content: str) -> Optional[str]:
        """Extract title from HTML content"""
        if not content:
            return None
        try:
            match = re.search(r'<title[^>]*>([^<]+)</title>', content[:5000], re.IGNORECASE)
            if match:
                import html
                return html.unescape(match.group(1).strip()[:200])
        except:
            pass
        return None

    def _extract_description(self, content: str) -> Optional[str]:
        """Extract Meta Description"""
        if not content:
            return None
        # Meta description pattern
        match = re.search(r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']', content, re.IGNORECASE)
        if match:
            import html
            return html.unescape(match.group(1).strip())
        # Try og:description?
        match = re.search(r'<meta\s+property=["\']og:description["\']\s+content=["\'](.*?)["\']', content, re.IGNORECASE)
        if match:
            import html
            return html.unescape(match.group(1).strip())
        return None

    def _extract_h1(self, content: str) -> Optional[str]:
        """Extract H1 tag content"""
        if not content:
            return None
        try:
            # Look for first H1 tag
            match = re.search(r'<h1[^>]*>(.*?)</h1>', content, re.IGNORECASE | re.DOTALL)
            if match:
                import html
                # Remove any nested tags within H1
                h1_text = re.sub(r'<[^>]+>', '', match.group(1))
                return html.unescape(h1_text.strip()[:500])
        except:
            pass
        return None

    def _extract_links(self, base_url: str, html: str) -> List[Dict[str, str]]:
        """
        Extract links from HTML with anchor text
        Returns: List of {'url': str, 'anchor_text': str, 'is_internal': bool}
        """
        links = []
        if not html or html == "BROWSER_CONTENT": # Handle browser content later if needed
            return links
        
        # DEBUG: Check if content is empty (SPA?)
        # logger.info(f"Extracting from {base_url} (Length: {len(html)}): {html[:300]}")
        # print(f"DEBUG_HTML: {base_url} len={len(html)} snippet={html[:200]}")
            
        try:
            soup = BeautifulSoup(html, 'html.parser')
            for a in soup.find_all('a', href=True):
                href = a['href']
                
                # Get anchor text
                anchor_text = a.get_text(strip=True)
                
                # If no text, check for image alt
                if not anchor_text:
                    img = a.find('img', alt=True)
                    if img and img['alt']:
                        anchor_text = f"[IMG: {img['alt'].strip()}]"
                
                # Fallback to href if still empty
                if not anchor_text:
                    anchor_text = href
                    
                # Limit anchor text length
                anchor_text = anchor_text[:200]
                
                full_url = urljoin(base_url, href)
                # Normalize & Filter
                normalized = URLNormalizer.normalize(full_url, self.base_domain)
                
                # DEBUG: Print dropped links
                if not normalized:
                    # logger.info(f"DROPPED: {full_url}")
                    pass
                else:
                    if not URLNormalizer.is_internal(normalized, self.base_domain):
                         # logger.info(f"FOUND EXTERNAL: {normalized}")
                         pass
                
                # Allow BOTH internal and external links
                if normalized:
                    links.append({
                        'url': normalized,
                        'anchor_text': anchor_text,
                        'is_internal': URLNormalizer.is_internal(normalized, self.base_domain)
                    })
        except Exception as e:
            logger.error(f"Extract error: {e}")
        return links
        
    async def _initial_discovery(self, client: httpx.AsyncClient) -> Set[str]:
        """Sitemap + API Discovery"""
        discovered = set()
        
        # 1. Standard Sitemap Discovery
        logger.info("   📍 Checking Sitemaps...")
        sitemap_urls = await self._discover_from_sitemaps(client)
        # Filter: Exclude .xml sitemaps from validation queue
        filtered_sitemap_urls = {u for u in sitemap_urls if not u.lower().endswith('.xml')}
        discovered.update(filtered_sitemap_urls)
        logger.info(f"   ✅ Sitemaps: Found {len(filtered_sitemap_urls)} URLs (skipped XMLs)")
        
        # 2. WordPress API Discovery (if applicable)
        # Check if WP first to avoid wasting requests
        if await self._detect_wordpress(client):
            logger.info("   📍 WordPress detected, checking REST API...")
            api_urls = await self._discover_from_wp_api(client)
            discovered.update(api_urls)
            logger.info(f"   ✅ WP API: Found {len(api_urls)} URLs")
            
        # 3. Add Start URL if nothing found
        if not discovered:
            discovered.add(self.start_url)
            
        return discovered

    async def _detect_wordpress(self, client: httpx.AsyncClient) -> bool:
        """Simple WP detection"""
        try:
            resp = await client.head(f"{self.start_url}/wp-json/", timeout=5.0)
            if resp.status_code in [200, 401, 403]: return True
            resp = await client.head(f"{self.start_url}/wp-includes/", timeout=5.0) 
            if resp.status_code in [200, 403]: return True
        except:
            pass
        return False

    async def _discover_from_sitemaps(self, client: httpx.AsyncClient) -> Set[str]:
        """Generic Sitemap Discovery"""
        urls = set()
        sitemap_candidates = [
            f"{self.start_url}/sitemap.xml",
            f"{self.start_url}/sitemap_index.xml",
            f"{self.start_url}/wp-sitemap.xml",
            "/sitemap.xml", # Relative check logic requires full url construction, assuming start_url is base
        ]
        
        # Simple implementation - could use the robust one from WordPressCrawler usually
        # For brevity, let's trust the RobotsParser might have found one too? 
        # Actually RobotsParser.parser.site_maps() exists!
        if self.robots_parser and self.robots_parser.parser.site_maps():
            sitemap_candidates.extend(self.robots_parser.parser.site_maps())
            
        for sitemap_url in list(set(sitemap_candidates)):
            try:
                if not sitemap_url.startswith('http'):
                     sitemap_url = urljoin(self.start_url, sitemap_url)
                     
                resp = await client.get(sitemap_url, timeout=10.0)
                if resp.status_code == 200:
                    # Parse XML
                    try:
                        root = ET.fromstring(resp.content)
                        # Handle namespaces is annoying, simple regex might be safer for quick extraction or use generic parsing
                        # Reusing WordPressCrawler logic is best but we can't easily inherit it.
                        # Let's use simple regex for speed and robustness against broken XML
                        found = re.findall(r'<loc>(http[^<]+)</loc>', resp.text)
                        urls.update(found)
                        
                        # Recursive check for Sitemap Index
                        if '<sitemapindex' in resp.text:
                            for potential_child in found:
                                if 'sitemap' in potential_child:
                                    # Recursively fetch child sitemap
                                    child_urls = await self._fetch_sitemap_urls(client, potential_child)
                                    urls.update(child_urls)
                    except:
                        pass
            except:
                pass
        return urls

    async def _fetch_sitemap_urls(self, client, url):
        """Fetch urls from a single sitemap"""
        try:
            resp = await client.get(url, timeout=10.0)
            if resp.status_code == 200:
                return set(re.findall(r'<loc>(http[^<]+)</loc>', resp.text))
        except: 
            return set()
        return set()

    async def _discover_from_wp_api(self, client: httpx.AsyncClient) -> Set[str]:
        """Fetch URLs from minimal WP API endpoints"""
        urls = set()
        endpoints = ['posts', 'pages', 'products']
        base_api = f"{self.start_url}/wp-json/wp/v2" # Naive, assumes standard path
        
        for ep in endpoints:
            try:
                # Fetch page 1 only for speed in discovery phase, let crawler find the rest via links?
                # No, user wants DISCOVERY. Let's fetch a few pages.
                resp = await client.get(f"{base_api}/{ep}?per_page=100&_fields=link", timeout=10.0)
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data:
                        if 'link' in item:
                            urls.add(item['link'])
            except:
                pass
        return urls




class HybridCrawler(ProfessionalCrawler):
    """
    Hybrid crawler alias for ProfessionalCrawler
    Maintains backward compatibility while using new engine
    """
    pass

# Old implementation removed to enforce new Professional Engine
# The wrapper.py will now instantiate this, which runs ProfessionalCrawler logic

