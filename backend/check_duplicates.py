import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_ANON_KEY")

supabase: Client = create_client(url, key)

def find_duplicates():
    print("--- Checking for duplicate sites ---")
    sites = supabase.table("sites").select("*").execute()
    url_map = {}
    for site in sites.data:
        u = site['site_url'].rstrip('/')
        if u not in url_map:
            url_map[u] = []
        url_map[u].append(site)
    
    for u, cases in url_map.items():
        if len(cases) > 1:
            print(f"\nDUPLICATE URL: {u}")
            for c in cases:
                print(f"  User ID: {c['user_id']}, Site ID: {c['site_id']}, Created: {c['created_at']}, Scan: {c['scan_status']}")

if __name__ == "__main__":
    find_duplicates()
