#!/bin/bash

echo "=========================================="
echo "Starting Flower (Celery Monitoring)"
echo "=========================================="
echo ""
echo "Flower Dashboard: http://localhost:5555"
echo "Monitor your Celery workers and tasks"
echo ""
echo "=========================================="

# Activate virtual environment
source .venv/bin/activate

# Start Flower
celery -A app.celery_app flower \
    --port=5555 \
    --broker=redis://localhost:6379/0
