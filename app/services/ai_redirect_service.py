"""
AI Redirect Suggestion Service
Uses Google Gemini API to generate intelligent redirect suggestions for broken links
"""

import os
import logging
import asyncio
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import google.generativeai as genai
from google.generativeai.types import GenerationConfig

logger = logging.getLogger(__name__)


@dataclass
class RedirectSuggestion:
    """Single redirect suggestion with confidence score"""
    target_url: str
    confidence: int  # 0-100
    reasoning: str
    redirect_type: str  # '301' or '302'


@dataclass
class RedirectPair:
    """Pair of redirect suggestions (primary + alternative)"""
    broken_url: str
    source_url: str
    anchor_text: str
    primary: RedirectSuggestion
    alternative: Optional[RedirectSuggestion] = None


class GeminiClient:
    """
    Google Gemini API client for generating redirect suggestions
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize Gemini client with API key"""
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        
        # Configure Gemini API
        genai.configure(api_key=self.api_key)
        
        # Use Gemini Flash for fast, cost-effective suggestions
        self.model = genai.GenerativeModel('gemini-flash-latest')
        
        # Generation config for consistent output
        self.generation_config = GenerationConfig(
            temperature=0.1,  # Very low temperature for concise, consistent output
            top_p=0.9,
            top_k=40,
            max_output_tokens=8192,  # Sufficient for complete JSON responses with detailed reasoning
            candidate_count=1,  # Single response
            stop_sequences=[],  # Don't stop early
            response_mime_type="application/json"  # Force JSON output structure
        )
        
        logger.info("Gemini API client initialized successfully")
    
    async def generate_content_async(self, prompt: str, max_retries: int = 3) -> str:
        """
        Generate content using Gemini API with retry logic
        
        Args:
            prompt: The prompt to send to Gemini
            max_retries: Maximum number of retry attempts
            
        Returns:
            Generated text response
        """
        for attempt in range(max_retries):
            try:
                # Run synchronous API call in thread pool to avoid blocking
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    lambda: self.model.generate_content(
                        prompt,
                        generation_config=self.generation_config
                    )
                )
                
                if response and response.text:
                    return response.text
                else:
                    logger.warning(f"Empty response from Gemini API (attempt {attempt + 1}/{max_retries})")
                    
            except Exception as e:
                logger.error(f"Gemini API error (attempt {attempt + 1}/{max_retries}): {str(e)}")
                
                # Exponential backoff
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # 1s, 2s, 4s
                    logger.info(f"Retrying in {wait_time} seconds...")
                    await asyncio.sleep(wait_time)
                else:
                    raise
        
        raise Exception("Failed to generate content after all retries")


class RedirectSuggestionEngine:
    """
    Main engine for generating AI-powered redirect suggestions
    """
    
    def __init__(self, gemini_client: Optional[GeminiClient] = None):
        """Initialize the suggestion engine"""
        self.client = gemini_client or GeminiClient()
        logger.info("Redirect Suggestion Engine initialized")
    
    def _build_prompt(
        self,
        broken_url: str,
        source_url: str,
        anchor_text: str,
        available_pages: List[Dict[str, str]]
    ) -> str:
        """
        Build the prompt for Gemini API
        
        Args:
            broken_url: The broken/404 URL
            source_url: The page where the broken link was found
            anchor_text: The link text/anchor
            available_pages: List of working pages with titles
            
        Returns:
            Formatted prompt string
        """
        # Format available pages list - send all pages for best matching
        pages_list = "\n".join([
            f"- {page['url']} | {page.get('title', 'N/A')}"
            for page in available_pages
        ])
        
        prompt = f"""Suggest 2 redirects for broken URL.

Broken: {broken_url}
Anchor: "{anchor_text}"

Pages:
{pages_list}

Return JSON. Each suggestion needs:
- target_url: The best matching URL from the list
- confidence: Score based on logic:
  * 90-100: Exact match (e.g. Product -> Product, Article -> Article)
  * 50-89: Category/Theme match (e.g. Product -> Category, Article -> Blog Home)
  * 0-49: Generic fallback (e.g. Homepage, Contact)
- reasoning: Clear explanation of WHY this specific target was chosen over others.
- redirect_type: "301"

Be concise but descriptive. Example:
{{"primary": {{"target_url": "https://...", "confidence": 95, "reasoning": "Product 'Blue Shirt' matches new URL 'blue-shirt-v2'", "redirect_type": "301"}}, "alternative": {{"target_url": "https://...", "confidence": 75, "reasoning": "Redirecting to 'Shirts' category as fallback", "redirect_type": "301"}}}}"""
        
        return prompt
    
    def _parse_response(self, response_text: str) -> Tuple[RedirectSuggestion, Optional[RedirectSuggestion]]:
        """
        Parse Gemini API response into RedirectSuggestion objects
        
        Args:
            response_text: JSON response from Gemini
            
        Returns:
            Tuple of (primary_suggestion, alternative_suggestion)
        """
        import json
        import re
        
        try:
            # Extract JSON from response (handle markdown code blocks)
            response_text = response_text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()
            
            # Try to fix incomplete JSON by finding the last complete object
            # If JSON is truncated, try to complete it
            if not response_text.endswith("}"):
                # Find the last complete primary object
                match = re.search(r'"primary"\s*:\s*\{[^}]+\}', response_text, re.DOTALL)
                if match:
                    # Wrap just the primary in a complete JSON object
                    response_text = "{" + match.group(0) + "}"
            
            try:
                data = json.loads(response_text)
            except json.JSONDecodeError:
                # Attempt to repair common JSON errors (missing quotes on keys)
                # primitive repair: add quotes to keys
                repaired_text = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', response_text)
                # fix trailing commas
                repaired_text = re.sub(r',\s*([}\]])', r'\1', repaired_text)
                
                try:
                    data = json.loads(repaired_text)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse JSON response even after repair: {str(e)}\nOriginal: {response_text}\nRepaired: {repaired_text}")
                    raise ValueError(f"Invalid JSON response from Gemini API: {str(e)}")

            # Parse primary suggestion
            primary_data = data.get("primary", {})
            if not primary_data:
                raise ValueError("No primary suggestion found in response")
                
            primary = RedirectSuggestion(
                target_url=primary_data.get("target_url", ""),
                confidence=min(100, max(0, int(primary_data.get("confidence", 0)))),
                reasoning=primary_data.get("reasoning") or primary_data.get("reason", "No reasoning provided"),
                redirect_type=primary_data.get("redirect_type", "301")
            )
            
            # Parse alternative suggestion (optional)
            alternative = None
            if "alternative" in data and data["alternative"]:
                alt_data = data["alternative"]
                alternative = RedirectSuggestion(
                    target_url=alt_data.get("target_url", ""),
                    confidence=min(100, max(0, int(alt_data.get("confidence", 0)))),
                    reasoning=alt_data.get("reasoning") or alt_data.get("reason", "No reasoning provided"),
                    redirect_type=alt_data.get("redirect_type", "301")
                )
            
            # Ensure primary is always the highest confidence
            if alternative and alternative.confidence > primary.confidence:
                logger.info(f"Swapping primary and alternative due to confidence: {alternative.confidence} > {primary.confidence}")
                primary, alternative = alternative, primary
                
            return primary, alternative
            
        except Exception as e:
            logger.error(f"Error parsing response: {str(e)}")
            raise
    
    async def generate_suggestions(
        self,
        broken_url: str,
        source_url: str,
        anchor_text: str,
        available_pages: List[Dict[str, str]]
    ) -> RedirectPair:
        """
        Generate redirect suggestions for a broken link
        
        Args:
            broken_url: The broken/404 URL
            source_url: The page where the broken link was found
            anchor_text: The link text/anchor
            available_pages: List of working pages with {'url': ..., 'title': ...}
            
        Returns:
            RedirectPair with primary and alternative suggestions
        """
        logger.info(f"Generating redirect suggestions for: {broken_url}")
        
        # Build prompt
        prompt = self._build_prompt(broken_url, source_url, anchor_text, available_pages)
        
        # Call Gemini API
        response_text = await self.client.generate_content_async(prompt)
        
        # Parse response
        primary, alternative = self._parse_response(response_text)
        
        # Create RedirectPair
        redirect_pair = RedirectPair(
            broken_url=broken_url,
            source_url=source_url,
            anchor_text=anchor_text,
            primary=primary,
            alternative=alternative
        )
        
        logger.info(
            f"Generated suggestions - Primary: {primary.target_url} ({primary.confidence}%), "
            f"Alternative: {alternative.target_url if alternative else 'None'}"
        )
        
        return redirect_pair
    
    async def generate_batch_suggestions(
        self,
        broken_links: List[Dict[str, str]],
        available_pages: List[Dict[str, str]],
        batch_size: int = 5
    ) -> List[RedirectPair]:
        """
        Generate suggestions for multiple broken links in batches
        
        Args:
            broken_links: List of broken links with 'url', 'source_url', 'anchor_text'
            available_pages: List of working pages
            batch_size: Number of links to process concurrently
            
        Returns:
            List of RedirectPair objects
        """
        logger.info(f"Processing {len(broken_links)} broken links in batches of {batch_size}")
        
        results = []
        
        # Process in batches to respect rate limits
        for i in range(0, len(broken_links), batch_size):
            batch = broken_links[i:i + batch_size]
            logger.info(f"Processing batch {i // batch_size + 1} ({len(batch)} links)")
            
            # Create tasks for concurrent processing
            tasks = [
                self.generate_suggestions(
                    broken_url=link['url'],
                    source_url=link.get('source_url', ''),
                    anchor_text=link.get('anchor_text', ''),
                    available_pages=available_pages
                )
                for link in batch
            ]
            
            # Wait for batch to complete
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results (success or fallback)
            for j, result in enumerate(batch_results):
                link = batch[j]
                
                if isinstance(result, Exception):
                    logger.error(f"Error generating suggestion for {link['url']}: {str(result)}")
                    
                    # FALLBACK: Create generic suggestions
                    # Select primary and alternative pages from available list
                    primary_page = available_pages[0] if available_pages else {"url": "/"}
                    
                    # Try to find a different page for alternative, otherwise reuse primary
                    alt_page = None
                    if len(available_pages) > 1:
                        alt_page = available_pages[1]
                    else:
                        alt_page = primary_page
                    
                    primary_suggestion = RedirectSuggestion(
                        target_url=primary_page['url'],
                        confidence=10,  # Non-zero confidence indicates automated fallback
                        reasoning="Automatic fallback (Primary): Redirect to main active page.",
                        redirect_type="301"
                    )
                    
                    alternative_suggestion = RedirectSuggestion(
                        target_url=alt_page['url'],
                        confidence=5,
                        reasoning="Automatic fallback (Alternative): Secondary option.",
                        redirect_type="301"
                    )
                    
                    fallback = RedirectPair(
                        broken_url=link['url'],
                        source_url=link.get('source_url', ''),
                        anchor_text=link.get('anchor_text', ''),
                        primary=primary_suggestion,
                        alternative=alternative_suggestion
                    )
                    results.append(fallback)
                else:
                    results.append(result)
            
            # Small delay between batches to avoid rate limiting
            if i + batch_size < len(broken_links):
                await asyncio.sleep(1)
        
        logger.info(f"Successfully generated {len(results)} redirect suggestions")
        return results
