from datetime import datetime, timedelta, timezone

def get_ist_now() -> datetime:
    """Returns the current time in Indian Standard Time (UTC+5:30)."""
    # IST is UTC + 5:30
    ist_offset = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist_offset)

def get_ist_now_iso() -> str:
    """Returns the current IST time as a formatted ISO string."""
    return get_ist_now().strftime("%Y-%m-%d %I:%M:%S %p")

def get_ist_timestamp_compact() -> str:
    """Returns compact timestamp in IST (YYYYMMDDHHMMSS)."""
    return get_ist_now().strftime("%Y%m%d%H%M%S")
