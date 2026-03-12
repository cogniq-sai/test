from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class MetadataFixRequest(BaseModel):
    site_id: str
    page_url: str
    field: str # 'title', 'description', 'h1'
    current_value: Optional[str] = None
    suggested_value: str

class MetadataFixResponse(BaseModel):
    success: bool
    optimization_id: Optional[str] = None
    message: str
    error: Optional[str] = None

class PendingFixItem(BaseModel):
    id: str
    page_url: str
    field: str
    suggested_value: str

class GetPendingFixesResponse(BaseModel):
    success: bool
    fixes: List[PendingFixItem]
    total: int
