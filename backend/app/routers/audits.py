from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from app.services.ai_audit_service import AIAuditService, PageAudit
from app.database import get_supabase
from app.schemas.metadata_fixes import MetadataFixRequest, MetadataFixResponse
from app.utils import get_ist_now_iso

router = APIRouter(prefix="/api/audits", tags=["Audits"])
ai_service = AIAuditService()

@router.post("/analyze-page")
async def analyze_page(url: str, title: Optional[str] = None, description: Optional[str] = None, h1: Optional[str] = None):
    """Manually trigger an AI audit for a single page"""
    audit = await ai_service.audit_page(url, title, description, h1)
    if not audit:
        raise HTTPException(status_code=500, detail="Failed to generate AI audit")
    return audit

@router.get("/site/{site_id}")
async def get_site_audits(site_id: str):
    """Retrieve existing audits for a site"""
    # This is a placeholder; real audits would fetch from public.page_audits
    return {"message": "Audit retrieval for site not yet implemented", "site_id": site_id}

@router.post("/apply-fix", response_model=MetadataFixResponse)
async def apply_fix(request: MetadataFixRequest):
    """Queue a metadata fix for the plugin to apply"""
    try:
        supabase = get_supabase()
        
        # Insert fix request into metadata_optimizations table
        res = supabase.table("metadata_optimizations").insert({
            "site_id": request.site_id,
            "page_url": request.page_url,
            "field": request.field,
            "current_value": request.current_value,
            "suggested_value": request.suggested_value,
            "status": "pending",
            "updated_at": get_ist_now_iso()
        }).execute()
        
        if not res.data:
            return MetadataFixResponse(success=False, message="Failed to queue fix request")
            
        return MetadataFixResponse(
            success=True, 
            optimization_id=res.data[0]['id'],
            message=f"Fix for {request.field} queued successfully. Plugin will apply it shortly."
        )
        
    except Exception as e:
        return MetadataFixResponse(success=False, message=str(e), error=str(e))
