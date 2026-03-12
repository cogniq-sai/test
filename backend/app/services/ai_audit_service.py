import os
import json
import logging
import asyncio
from typing import List, Dict, Any, Optional
import google.generativeai as genai
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class AuditRecommendation(BaseModel):
    field: str = Field(..., description="The field being improved (title, description, h1)")
    current_value: str = Field(..., description="The current value found on page")
    suggested_value: str = Field(..., description="The suggested optimized value")
    reasoning: str = Field(..., description="Why this change helps SEO")
    priority: str = Field(..., description="Priority: High, Medium, Low")

class PageAudit(BaseModel):
    url: str
    score: int = Field(..., description="SEO score 0-100")
    recommendations: List[AuditRecommendation]
    critical_issues: int
    warnings: int

class AIAuditService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            logger.error("GEMINI_API_KEY not found in environment")
            return

        genai.configure(api_key=self.api_key)
        # Use gemini-flash-latest for cost/speed efficiency
        self.model = genai.GenerativeModel('gemini-1.5-flash-latest')

    async def audit_page(self, url: str, title: Optional[str], description: Optional[str], h1: Optional[str]) -> Optional[PageAudit]:
        """Use AI to analyze page metadata and suggest improvements"""
        if not self.api_key:
            return None

        prompt = f"""
        You are an expert SEO auditor. Analyze the following page metadata and provide a detailed audit in JSON format.
        
        URL: {url}
        Current Title: {title or 'MISSING'}
        Current Meta Description: {description or 'MISSING'}
        Current H1 Tag: {h1 or 'MISSING'}

        Rules:
        1. Evaluate against current SEO best practices (title length 50-60 chars, description 120-160, keyword in H1, etc.)
        2. Provide optimized suggestions for MISSING or sub-optimal fields.
        3. Rate the overall SEO health of these tags from 0-100.
        4. Return ONLY valid JSON.

        JSON structure:
        {{
            "score": number,
            "critical_issues": number,
            "warnings": number,
            "recommendations": [
                {{
                    "field": "title" | "description" | "h1",
                    "current_value": "string",
                    "suggested_value": "string",
                    "reasoning": "string",
                    "priority": "High" | "Medium" | "Low"
                }}
            ]
        }}
        """

        try:
            # Add a timeout for safety
            response = await asyncio.to_thread(
                self.model.generate_content,
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            
            if not response or not response.text:
                logger.error(f"Empty response from Gemini for audit: {url}")
                return None

            data = json.loads(response.text)
            return PageAudit(url=url, **data)

        except Exception as e:
            logger.error(f"AI Audit Error for {url}: {e}")
            return None

    async def audit_batch(self, pages: List[Dict[str, Any]]) -> List[PageAudit]:
        """Audit multiple pages matching internal metadata format"""
        results = []
        # Process in chunks to avoid rate limits
        chunk_size = 5
        for i in range(0, len(pages), chunk_size):
            chunk = pages[i:i+chunk_size]
            tasks = []
            for page in chunk:
                tasks.append(self.audit_page(
                    url=page['url'],
                    title=page.get('title'),
                    description=page.get('description'),
                    h1=page.get('h1')
                ))
            
            chunk_results = await asyncio.gather(*tasks)
            results.extend([r for r in chunk_results if r])
            
            # Sublte sleep between chunks
            if i + chunk_size < len(pages):
                await asyncio.sleep(1.0)
                
        return results
