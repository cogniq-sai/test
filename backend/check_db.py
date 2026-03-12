import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_ANON_KEY")

if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env")
    exit(1)

supabase: Client = create_client(url, key)

def check_status():
    print("--- Sites ---")
    sites = supabase.table("sites").select("*").execute()
    for site in sites.data:
        print(f"ID: {site['site_id']}, Name: {site['site_name']}, URL: {site['site_url']}, Scan Status: {site['scan_status']}")
    
    print("\n--- All Pages (Count per Site) ---")
    pages = supabase.table("all_pages").select("site_id", count="exact").execute()
    # Note: count exact might need grouping or multiple queries depending on supabase-py version
    # Let's just fetch all and count locally for simplicity since it's a test script
    all_pages = supabase.table("all_pages").select("site_id").execute()
    counts = {}
    for p in all_pages.data:
        sid = p['site_id']
        counts[sid] = counts.get(sid, 0) + 1
    for sid, count in counts.items():
        print(f"Site ID: {sid}, Pages: {count}")

    print("\n--- Scan Errors (Count per Site) ---")
    errors = supabase.table("scan_errors").select("site_id").execute()
    err_counts = {}
    for e in errors.data:
        sid = e['site_id']
        err_counts[sid] = err_counts.get(sid, 0) + 1
    for sid, count in err_counts.items():
        print(f"Site ID: {sid}, Errors: {count}")

if __name__ == "__main__":
    check_status()
