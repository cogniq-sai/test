import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

def get_supabase_client() -> Client:
    """Initialize and return a Supabase client."""
    url: str = os.environ.get("SUPABASE_URL", "")
    key: str = os.environ.get("SUPABASE_ANON_KEY", "")

    if not url or not key:
        print("❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in your .env file.")
        exit(1)
    
    try:
        return create_client(url, key)
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
        exit(1)

supabase: Client = get_supabase_client()

def list_all_user_site_mapping():
    print("--- User to Site Mapping ---")
    sites = supabase.table("sites").select("user_id, site_url, site_id").execute()
    for site in sites.data:
        print(f"User: {site['user_id']}, Site: {site['site_url']}, ID: {site['site_id']}")

if __name__ == "__main__":
    list_all_user_site_mapping()
