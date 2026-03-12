from .auth import router as auth_router
from .sites import router as sites_router
from .plugin import router as plugin_router
from .scan import router as scan_router
from .redirects import router as redirects_router

__all__ = ["auth_router", "sites_router", "plugin_router", "scan_router", "redirects_router"]
