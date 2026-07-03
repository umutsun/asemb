"""
Crawl4AI Web Scraping Service
Advanced AI-powered web scraping with LLM extraction
"""

import os
import json
from typing import Optional, Dict, Any, List
from datetime import datetime
from urllib.parse import urlparse
import hashlib

# crawl4ai is an OPTIONAL, heavy dependency (pulls playwright + pins lxml/numpy that conflict
# with the rest of the stack, and is absent on the air-gapped GX10 appliance). Guard the import
# so the FastAPI service still boots without it; crawl endpoints then fail with a clear error
# instead of taking the whole service down at import time.
try:
    from crawl4ai import AsyncWebCrawler
    from crawl4ai.extraction_strategy import (
        LLMExtractionStrategy,
        JsonCssExtractionStrategy,
        CosineStrategy
    )
    _CRAWL4AI_AVAILABLE = True
except ImportError:
    AsyncWebCrawler = None  # type: ignore
    LLMExtractionStrategy = JsonCssExtractionStrategy = CosineStrategy = None  # type: ignore
    _CRAWL4AI_AVAILABLE = False

from loguru import logger

from services.database import execute_update, execute_query
from services.redis_client import cache_get, cache_set

# Engine fallback (httpx+BS / Playwright) so AUTO crawls keep working when crawl4ai is absent.
# Guarded: a problem importing the runtime must never break the FastAPI service.
try:
    from crawler_runtime import engine as crawl_engine
    _ENGINE_FALLBACK_AVAILABLE = True
except Exception as _eng_err:  # pragma: no cover
    crawl_engine = None  # type: ignore
    _ENGINE_FALLBACK_AVAILABLE = False

class Crawl4AIService:
    """Service for AI-powered web scraping using Crawl4AI"""

    def __init__(self):
        if not _CRAWL4AI_AVAILABLE:
            if _ENGINE_FALLBACK_AVAILABLE:
                logger.warning(
                    "[crawl4ai] package not installed — AUTO mode falls back to "
                    f"engine chain {crawl_engine.available_engines()}; LLM/SCHEMA modes disabled"
                )
            else:
                logger.warning("[crawl4ai] package not installed — crawl endpoints disabled (service still runs)")
        self.max_workers = int(os.getenv("CRAWL4AI_MAX_WORKERS", 5))
        self.timeout = int(os.getenv("CRAWL4AI_TIMEOUT", 30))
        self.max_retries = int(os.getenv("CRAWL4AI_MAX_RETRIES", 3))
        self.use_cache = os.getenv("CRAWL4AI_USE_CACHE", "true").lower() == "true"

    async def crawl_with_llm(
        self,
        url: str,
        extraction_prompt: str,
        model: str = "gpt-4",
        provider: str = "openai",
        js_code: Optional[str] = None,
        wait_for: Optional[str] = None,
        screenshot: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Crawl a webpage and extract structured data using LLM

        Args:
            url: Target URL to crawl
            extraction_prompt: Instructions for LLM extraction
            model: LLM model to use
            provider: LLM provider (openai, anthropic, etc.)
            js_code: JavaScript to execute before extraction
            wait_for: CSS selector to wait for
            screenshot: Whether to take a screenshot
            **kwargs: Additional crawl options

        Returns:
            Extracted data with metadata
        """
        if not _CRAWL4AI_AVAILABLE:
            raise RuntimeError(
                "LLM extraction requires the crawl4ai package, which is not installed. "
                "Use mode='auto' for static (httpx/Playwright) content extraction instead."
            )
        # Check cache first
        if self.use_cache:
            cache_key = self._generate_cache_key(url, extraction_prompt)
            cached = await cache_get(cache_key)
            if cached:
                logger.info(f"Cache hit for {url}")
                return cached

        try:
            async with AsyncWebCrawler(verbose=True) as crawler:
                # Configure extraction strategy
                extraction_strategy = LLMExtractionStrategy(
                    provider=provider,
                    api_token=os.getenv("OPENAI_API_KEY") if provider == "openai" else None,
                    model=model,
                    instruction=extraction_prompt,
                    max_tokens=kwargs.get("max_tokens", 4000),
                    temperature=kwargs.get("temperature", 0.7)
                )

                # Perform crawl
                result = await crawler.arun(
                    url=url,
                    extraction_strategy=extraction_strategy,
                    js_code=js_code,
                    wait_for=wait_for,
                    screenshot=screenshot,
                    bypass_cache=True,  # We handle our own caching
                    timeout=self.timeout,
                    **kwargs
                )

                # Process result
                processed = await self._process_crawl_result(result, url)

                # Store in database
                await self._store_scraped_content(processed)

                # Cache result
                if self.use_cache:
                    await cache_set(cache_key, processed, expire=3600)

                return processed

        except Exception as e:
            logger.error(f"Crawl4AI LLM extraction failed for {url}: {e}")
            raise

    async def crawl_auto(
        self,
        url: str,
        max_depth: int = 1,
        follow_links: bool = False,
        content_type: str = "all",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Auto crawl with intelligent content extraction

        Args:
            url: Target URL
            max_depth: Maximum crawl depth
            follow_links: Whether to follow links
            content_type: Type of content to extract (all, article, product, etc.)

        Returns:
            Extracted content with metadata
        """
        if not _CRAWL4AI_AVAILABLE:
            return await self._crawl_auto_fallback(
                url, max_depth=max_depth, follow_links=follow_links, **kwargs
            )
        try:
            async with AsyncWebCrawler(verbose=True) as crawler:
                # Use cosine similarity strategy for semantic extraction
                extraction_strategy = CosineStrategy(
                    semantic_filter=kwargs.get("semantic_filter"),
                    word_count_threshold=kwargs.get("word_count_threshold", 10)
                ) if content_type == "semantic" else None

                # Crawl with auto mode
                result = await crawler.arun(
                    url=url,
                    extraction_strategy=extraction_strategy,
                    bypass_cache=True,
                    timeout=self.timeout,
                    **kwargs
                )

                # Handle multiple pages if follow_links is enabled
                all_content = [result]
                if follow_links and max_depth > 1:
                    links = await self._extract_links(result)
                    for link in links[:10]:  # Limit to 10 links
                        try:
                            link_result = await crawler.arun(
                                url=link,
                                extraction_strategy=extraction_strategy,
                                bypass_cache=True,
                                timeout=self.timeout
                            )
                            all_content.append(link_result)
                        except Exception as e:
                            logger.warning(f"Failed to crawl linked page {link}: {e}")

                # Process and combine results
                processed = await self._process_multi_page_results(all_content, url)

                # Store in database
                await self._store_scraped_content(processed)

                return processed

        except Exception as e:
            logger.error(f"Auto crawl failed for {url}: {e}")
            raise

    async def crawl_with_schema(
        self,
        url: str,
        schema: Dict[str, Any],
        css_selectors: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Crawl with structured data extraction using schema

        Args:
            url: Target URL
            schema: JSON schema for extraction
            css_selectors: CSS selectors for specific fields

        Returns:
            Structured data matching schema
        """
        if not _CRAWL4AI_AVAILABLE:
            raise RuntimeError(
                "Schema (JSON/CSS) extraction requires the crawl4ai package, which is not "
                "installed. Use mode='auto' for static (httpx/Playwright) content extraction instead."
            )
        try:
            async with AsyncWebCrawler(verbose=True) as crawler:
                # Configure JSON/CSS extraction
                extraction_strategy = JsonCssExtractionStrategy(
                    schema=schema,
                    css_selectors=css_selectors
                ) if schema else None

                result = await crawler.arun(
                    url=url,
                    extraction_strategy=extraction_strategy,
                    bypass_cache=True,
                    timeout=self.timeout,
                    **kwargs
                )

                # Process result
                processed = await self._process_crawl_result(result, url)

                # Validate against schema if provided
                if schema:
                    processed["structured_data"] = result.extracted_content

                # Store in database
                await self._store_scraped_content(processed)

                return processed

        except Exception as e:
            logger.error(f"Schema-based crawl failed for {url}: {e}")
            raise

    def _fallback_processed(self, res: Any) -> Dict[str, Any]:
        """Shape an engine FetchResult into the same dict crawl4ai results use."""
        text = res.text or ""
        return {
            "url": res.url,
            "title": res.title or "",
            "content": text,
            "markdown": text,  # no markdown without crawl4ai; reuse plain text
            "extracted_content": None,
            "metadata": {
                "crawled_at": datetime.now().isoformat(),
                "success": res.success,
                "status_code": res.status,
                "content_type": "text/html",
                "engine": res.engine,
                "word_count": len(text.split()),
                "links_count": len(res.links),
                "images_count": 0,
                "screenshot": None,
                "fallback": True,
            },
            "links": res.links[:50],
            "images": [],
        }

    async def _crawl_auto_fallback(
        self,
        url: str,
        max_depth: int = 1,
        follow_links: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """AUTO-mode crawl using the engine fallback chain (crawl4ai unavailable)."""
        timeout = int(kwargs.get("timeout") or self.timeout)
        wait_for = kwargs.get("wait_for")
        render = bool(kwargs.get("js_code") or wait_for)
        logger.info(f"[crawl4ai] engine-fallback AUTO crawl for {url} (render={render})")

        res = await crawl_engine.fetch(url, render=render, wait_for=wait_for, timeout=timeout)
        if not res.success:
            raise RuntimeError(f"engine fallback failed for {url}: {res.error}")

        processed = self._fallback_processed(res)

        # Optional shallow same-domain link following (capped, mirrors crawl_auto's limit of 10)
        if follow_links and max_depth > 1:
            base_domain = urlparse(url).netloc
            seen = {url}
            extra_text = [processed["content"]]
            all_links = set(processed["links"])
            for link in res.links:
                if len(seen) > 10:
                    break
                if link in seen or urlparse(link).netloc != base_domain:
                    continue
                seen.add(link)
                try:
                    lres = await crawl_engine.fetch(link, timeout=timeout)
                    if lres.success and lres.text:
                        extra_text.append(lres.text)
                        all_links.update(lres.links[:50])
                except Exception as e:
                    logger.warning(f"[crawl4ai] fallback failed to follow {link}: {e}")
            processed["content"] = "\n\n".join(t for t in extra_text if t)
            processed["markdown"] = processed["content"]
            processed["links"] = list(all_links)[:100]
            processed["metadata"]["pages_crawled"] = len(seen)
            processed["metadata"]["word_count"] = len(processed["content"].split())

        await self._store_scraped_content(processed)
        return processed

    async def _process_crawl_result(
        self,
        result: Any,
        url: str
    ) -> Dict[str, Any]:
        """Process and structure crawl result"""
        return {
            "url": url,
            "title": getattr(result, "title", ""),
            "content": getattr(result, "cleaned_text", ""),
            "markdown": getattr(result, "markdown", ""),
            "extracted_content": getattr(result, "extracted_content", None),
            "metadata": {
                "crawled_at": datetime.now().isoformat(),
                "success": getattr(result, "success", True),
                "status_code": getattr(result, "status_code", 200),
                "content_type": getattr(result, "content_type", "text/html"),
                "word_count": len(getattr(result, "cleaned_text", "").split()),
                "links_count": len(getattr(result, "links", [])),
                "images_count": len(getattr(result, "images", [])),
                "screenshot": getattr(result, "screenshot", None)
            },
            "links": getattr(result, "links", [])[:50],  # Limit links
            "images": getattr(result, "images", [])[:20]  # Limit images
        }

    async def _process_multi_page_results(
        self,
        results: List[Any],
        base_url: str
    ) -> Dict[str, Any]:
        """Process multiple page results"""
        combined = {
            "url": base_url,
            "pages": [],
            "total_content": "",
            "total_links": set(),
            "total_images": set(),
            "metadata": {
                "crawled_at": datetime.now().isoformat(),
                "pages_crawled": len(results),
                "total_word_count": 0
            }
        }

        for result in results:
            processed = await self._process_crawl_result(result, result.url if hasattr(result, 'url') else base_url)
            combined["pages"].append(processed)
            combined["total_content"] += processed["content"] + "\n\n"
            combined["total_links"].update(processed["links"])
            combined["total_images"].update(processed["images"])
            combined["metadata"]["total_word_count"] += processed["metadata"]["word_count"]

        # Convert sets to lists
        combined["total_links"] = list(combined["total_links"])[:100]
        combined["total_images"] = list(combined["total_images"])[:50]

        return combined

    async def _extract_links(self, result: Any) -> List[str]:
        """Extract relevant links from crawl result"""
        links = getattr(result, "links", [])
        # Filter for relevant links (same domain, not media files, etc.)
        base_domain = result.url.split('/')[2] if hasattr(result, 'url') else ""
        filtered = []
        for link in links:
            if base_domain in link and not any(ext in link for ext in ['.jpg', '.png', '.pdf', '.zip']):
                filtered.append(link)
        return filtered[:20]  # Limit to 20 links

    async def _store_scraped_content(self, data: Dict[str, Any]):
        """Store scraped content in database"""
        try:
            content_hash = hashlib.md5(
                (data["url"] + data.get("content", "")).encode()
            ).hexdigest()

            await execute_update("""
                INSERT INTO scraped_pages (
                    url, title, content, markdown,
                    metadata, content_hash, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (url) DO UPDATE SET
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    markdown = EXCLUDED.markdown,
                    metadata = EXCLUDED.metadata,
                    content_hash = EXCLUDED.content_hash,
                    updated_at = NOW()
            """,
                data["url"],
                data.get("title", ""),
                data.get("content", ""),
                data.get("markdown", ""),
                json.dumps(data.get("metadata", {})),
                content_hash
            )
            logger.info(f"Stored scraped content for {data['url']}")
        except Exception as e:
            logger.error(f"Failed to store scraped content: {e}")

    def _generate_cache_key(self, url: str, prompt: str) -> str:
        """Generate cache key for URL and prompt combination"""
        return f"crawl4ai:{hashlib.md5((url + prompt).encode()).hexdigest()}"

# Global service instance
crawl4ai_service = Crawl4AIService()