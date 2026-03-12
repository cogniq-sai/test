#!/bin/bash
# Start the backend with proper logging

echo "=========================================="
echo "Starting SEO Agent Backend"
echo "=========================================="
echo ""

# Check dependencies
echo "Checking dependencies..."
python -c "import httpx; import bs4; print('✓ httpx and beautifulsoup4 installed')" || {
    echo "❌ Dependencies missing! Installing..."
    pip install httpx beautifulsoup4 lxml brotli
}

echo ""
echo "Starting server..."
echo "Watch the logs below for crawler activity"
echo "=========================================="
echo ""

# Start uvicorn with reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000
