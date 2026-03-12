#!/bin/bash

echo "=========================================="
echo "Starting Celery Worker (Scan Tasks)"
echo "=========================================="
echo ""
echo "This worker processes scan jobs in the background"
echo "You can run multiple workers for horizontal scaling"
echo ""
echo "=========================================="

# Activate virtual environment
source .venv/bin/activate

# Start Celery worker
celery -A app.celery_app worker \
    --loglevel=info \
    --concurrency=4 \
    --queue=scans \
    --hostname=worker@%h
