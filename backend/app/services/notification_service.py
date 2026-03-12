import logging
from app.database import get_supabase
from app.utils import get_ist_now_iso

logger = logging.getLogger(__name__)

def create_in_app_notification(site_id: str, notification_type: str, message: str) -> bool:
    """
    Creates a new notification record in the database.
    """
    try:
        supabase = get_supabase()
        supabase.table("notifications").insert({
            "site_id": site_id,
            "type": notification_type,
            "message": message,
            "is_read": False,
            "created_at": get_ist_now_iso()
        }).execute()
        
        logger.info(f"[Notification] In-app notification created for site {site_id}: {message}")
        return True
    except Exception as e:
        logger.error(f"[Notification] Failed to create in-app notification for site {site_id}: {e}")
        return False

def send_immediate_email(to_email: str, subject: str, body: str) -> bool:
    """
    Simulates sending an immediate email notification.
    In a real implementation, this would use a service like SendGrid, Resend, or AWS SES.
    """
    try:
        # TODO: Implement actual email sending logic here
        logger.info(f"[Notification] 📧 EMAIL SENT to {to_email}")
        logger.info(f"    Subject: {subject}")
        logger.info(f"    Body: {body}")
        
        return True
    except Exception as e:
        logger.error(f"[Notification] Failed to send email to {to_email}: {e}")
        return False

def notify_plugin_detected(site_id: str, plugins: list):
    """
    Wrapper function to handle notifying the user when an SEO plugin is detected
    during a sitemap scan.
    """
    plugin_names = ", ".join(plugins)
    subject = f"ACTION REQUIRED: SEO Plugin(s) Detected ({plugin_names})"
    message = f"We detected active SEO plugin(s) ({plugin_names}) managing your sitemap. Your recently generated clean sitemap is currently PAUSED and requires your manual approval to override."

    # 1. Create In-App Notification (Action Item #5)
    create_in_app_notification(
        site_id=site_id,
        notification_type="plugin_detected",
        message=message
    )
    
    # 2. Send Immediate Email (Action Item #2)
    # Fetch site owner's email from the DB if available.
    # We'll use a placeholder email if none is found.
    try:
        supabase = get_supabase()
        # Ensure your 'sites' table has an 'user_email' or link to the 'users' table.
        # This is a generic lookup - adjust query based on actual schema.
        site_res = supabase.table("sites").select("site_url").eq("site_id", site_id).execute()
        
        site_url = "your WordPress site"
        if site_res.data:
            site_url = site_res.data[0].get("site_url", site_url)
            
        # Hardcoding a notification address for this example/demo.
        # Normally you would join with auth.users to get the correct email.
        owner_email = "admin@example.com"
        
        email_body = f"""
        Hello,
        
        During our recent scan of {site_url}, we detected that you are already using the following SEO plugins to manage your sitemap:
        
        - {plugin_names}
        
        To prevent conflicts, our AI Sitemap Optimization system has PAUSED the application of your new dynamically generated XML sitemap.
        
        Please log into your AI SEO Dashboard to review the generated sitemap and manually Approve or Reject it.
        
        Best,
        AI SEO Automation System
        """
        
        send_immediate_email(owner_email, subject, email_body)

    except Exception as e:
        logger.error(f"[Notification] Error fetching user details for email: {e}")

def notify_scan_completed(site_id: str, pages_count: int, errors_found: int):
    """Notify user that a site scan has finished"""
    message = f"Scan complete for your site! Found {pages_count} pages and {errors_found} errors/warnings. Check the dashboard for details."
    
    # 1. In-app
    create_in_app_notification(site_id, "scan_completed", message)
    
    # 2. Email (Optional/Simulated)
    subject = f"SEO Scan Complete: {pages_count} Pages Analyzed"
    send_immediate_email("admin@example.com", subject, message)

def notify_high_priority_audit(site_id: str, url: str, issue_count: int):
    """Notify user when AI audit finds critical issues"""
    message = f"CRITICAL: AI Audit found {issue_count} high-priority SEO issues on {url}. Optimize these now for a traffic boost!"
    
    # 1. In-app
    create_in_app_notification(site_id, "ai_audit_critical", message)
    
    # 2. Email
    subject = f"SEO Alert: Critical Issues Detected on {url}"
    send_immediate_email("admin@example.com", subject, message)
