import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_ANON_KEY")

supabase: Client = create_client(url, key)

def list_recent_site_activity():
    print("--- Recent Site Activity ---")
    sites = supabase.table("sites").select("user_id, site_url, site_id, created_at").order("created_at", desc=True).limit(5).execute()
    for site in sites.data:
        print(f"User: {site['user_id']}, Site: {site['site_url']}, Created: {site['created_at']}, ID: {site['site_id']}")

if __name__ == "__main__":
    list_recent_site_activity()
