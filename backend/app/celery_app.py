"""
Celery Configuration for Distributed Task Queue
Handles background scan jobs across multiple workers
"""

import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

# Redis connection URL
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Create Celery app
celery_app = Celery(
    "seo_agent",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.scan_tasks"]
)

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Performance settings
    worker_prefetch_multiplier=1,  # One task at a time per worker
    worker_max_tasks_per_child=50,  # Restart worker after 50 tasks (prevent memory leaks)
    task_acks_late=True,  # Acknowledge task after completion (reliability)
    task_reject_on_worker_lost=True,  # Requeue if worker dies
    
    # Result backend settings
    result_expires=3600,  # Results expire after 1 hour
    result_backend_transport_options={
        'master_name': 'mymaster',
        'visibility_timeout': 3600,
    },
    
    # Task routing
    task_routes={
        "app.tasks.scan_tasks.run_scan_task": {"queue": "scans"},
    },
    
    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,
)

# Task time limits (prevent stuck tasks)
celery_app.conf.task_time_limit = 3600  # 1 hour hard limit
celery_app.conf.task_soft_time_limit = 3000  # 50 minutes soft limit
