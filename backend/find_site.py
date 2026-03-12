import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_ANON_KEY")

supabase: Client = create_client(url, key)

def check_site(domain_substring):
    print(f"--- Searching for '{domain_substring}' ---")
    sites = supabase.table("sites").select("*").ilike("site_url", f"%{domain_substring}%").execute()
    
    if not sites.data:
        print("No matching site found.")
        return

    for site in sites.data:
        sid = site['site_id']
        print(f"\nSITE FOUND:")
        print(f"  ID: {sid}")
        print(f"  Name: {site['site_name']}")
        print(f"  URL: {site['site_url']}")
        print(f"  User ID: {site['user_id']}")
        print(f"  Scan Status: {site['scan_status']}")
        
        # Check pages
        pages = supabase.table("all_pages").select("url", count="exact").eq("site_id", sid).limit(5).execute()
        total_pages = pages.count if pages.count is not None else "Unknown"
        print(f"  Total Pages in DB: {total_pages}")
        if pages.data:
            print("  Sample Pages:")
            for p in pages.data:
                print(f"    - {p['url']}")
        
        # Check errors
        errors = supabase.table("scan_errors").select("broken_url", count="exact").eq("site_id", sid).limit(5).execute()
        total_errors = errors.count if errors.count is not None else "Unknown"
        print(f"  Total Errors in DB: {total_errors}")
        if errors.data:
            print("  Sample Errors:")
            for e in errors.data:
                print(f"    - {e['broken_url']}")

if __name__ == "__main__":
    check_site("shubham")
