"""
AI SEO Agent - Backend API
Clean entry point with router architecture

Security:
- Dashboard endpoints use JWT Bearer tokens
- Plugin endpoints use X-API-Key header validation
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import logging
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger(__name__)

# Import routers
from app.routers import auth_router, sites_router, plugin_router, scan_router, redirects_router
from app.routers.sitemap import router as sitemap_router
from app.routers.notifications import router as notifications_router

# =====================
# Create FastAPI App
# =====================
tags_metadata = [
    {
        "name": "Authentication",
        "description": "Endpoints for user registration, login, and token validation.",
    },
    {
        "name": "Sites Management",
        "description": "API for managing registered WordPress sites and their settings.",
    },
    {
        "name": "Scan & Analysis",
        "description": "Core endpoints for triggering and monitoring site SEO scans and broken link detection.",
    },
    {
        "name": "AI Redirect Suggestions",
        "description": "AI-powered redirect suggestions for broken links using Google Gemini API.",
    },
    {
        "name": "WordPress Plugin Integration",
        "description": "Specialized endpoints used by the WordPress plugin for connection and syncing.",
    },
    {
        "name": "System",
        "description": "General system health and status endpoints.",
    },
]

app = FastAPI(
    title="AI SEO Agent API",
    description="""
## Backend API for AI-powered SEO automation.

This API provides endpoints for:
* **Managing Sites**: Register and track your WordPress sites.
* **Scanning**: Perform deep scans for broken links and SEO issues.
* **Security**: JWT-based authentication for dashboard and API keys for plugins.
""",
    version="1.0.0",
    openapi_tags=tags_metadata,
)

# =====================
# CORS Configuration
# =====================
# Standard dev origins
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://seo-flow-ai-frontend.vercel.app", # Example production domain
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================
# Include Routers
# =====================
app.include_router(auth_router)    # /api/v1/auth/*
app.include_router(sites_router)   # /api/v1/sites/*
app.include_router(scan_router)    # /api/v1/scan/*
app.include_router(redirects_router)  # /api/v1/redirects/* (AI-powered)
app.include_router(plugin_router)  # /api/v1/plugin/*
app.include_router(sitemap_router) # /api/v1/sitemap/*
app.include_router(notifications_router) # /api/v1/notifications/*


# =====================
# Health Check Endpoints
# =====================
@app.on_event("startup")
async def startup_event():
    """Run tasks on server startup"""
    logger.info("Starting AI SEO Backend...")
    
    # Start stale redirect monitor
    from app.services.monitor_service import start_monitor_loop, check_stale_redirects
    import asyncio
    
    # Run an immediate check on startup (non-blocking)
    asyncio.create_task(check_stale_redirects())
    
    # Start periodic loop
    asyncio.create_task(start_monitor_loop())
    
    logger.info("Monitor service started.")

@app.get("/", tags=["System"], summary="API Root - Check Status")
def root():
    """Returns the API status and version information."""
    return {"message": "AI SEO Agent API is running", "version": "1.0.0"}


@app.get("/health", tags=["System"], summary="System Health Check")
def health_check():
    """Checks if the API and its dependencies are working correctly."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# =====================
# Run Server
# =====================
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
