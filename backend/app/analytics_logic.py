from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

def calculate_site_health(pages: List[Dict[str, Any]], error_count: int) -> Dict[str, Any]:
    """
    Standard scoring logic to calculate site health based on crawl data.
    """
    total_pages = len(pages)
    
    if total_pages == 0:
        return {
            "score": 0,
            "status": "No data",
            "metrics": {
                "missing_titles": 0,
                "missing_descriptions": 0,
                "missing_h1s": 0,
                "total_pages": 0,
                "total_errors": 0
            }
        }

    # 1. Calculate Missing Metadata
    # We count titles as missing if they are empty or generic "Home Page" on non-root URLs
    missing_titles = sum(1 for p in pages if not p.get("title") or (p.get("title") == "Home Page" and p.get("url") not in ["/", "https://", "http://"])) 
    missing_descriptions = sum(1 for p in pages if not p.get("meta_description"))
    missing_h1s = sum(1 for p in pages if not p.get("h1_tag"))
    
    # 2. Scoring Logic (Base 100)
    score = 100
    
    # Deduction for broken links (Critical)
    # Each broken link subtracts 5 points
    score -= (error_count * 5)
    
    # Deduction for missing metadata (Important)
    # Metadata deductions contribute up to 30% of the total score
    metadata_penalty = ((missing_titles + missing_descriptions + missing_h1s) / (total_pages * 3)) * 30
    score -= metadata_penalty

    # Ensure score is between 0-100
    score = max(0, min(100, round(score)))
    
    # Determine Status
    if score > 85:
        health_status = "Excellent"
    elif score > 70:
        health_status = "Good"
    elif score > 50:
        health_status = "Fair"
    else:
        health_status = "Poor"

    return {
        "score": score,
        "status": health_status,
        "metrics": {
            "total_pages": total_pages,
            "total_errors": error_count,
            "missing_titles": missing_titles,
            "missing_descriptions": missing_descriptions,
            "missing_h1s": missing_h1s
        }
    }
