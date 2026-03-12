import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_ANON_KEY")

supabase: Client = create_client(url, key)

def reconcile():
    print("--- Reconciling sites for shubhamseo.xyz ---")
    sites = supabase.table("sites").select("*").ilike("site_url", "%shubhamseo.xyz%").execute()
    
    if not sites.data:
        print("No sites found for shubhamseo.xyz")
        return

    # User associated with the completed data (275 pages)
    completed_site = None
    new_user_id = None
    empty_site_id = None

    for site in sites.data:
        # Check pages count for this site_id
        pages = supabase.table("all_pages").select("url", count="exact").eq("site_id", site['site_id']).execute()
        count = pages.count if pages.count is not None else 0
        print(f"Site ID: {site['site_id']}, User ID: {site['user_id']}, Pages: {count}, Created: {site['created_at']}")
        
        if count > 100:
            completed_site = site
        else:
            new_user_id = site['user_id']
            empty_site_id = site['site_id']

    if completed_site and new_user_id and empty_site_id:
        print(f"\nACTIONS TO TAKE:")
        print(f"1. Update Site {completed_site['site_id']} set user_id = {new_user_id}")
        print(f"2. Delete empty Site {empty_site_id}")
        
        # Perform the update
        supabase.table("sites").update({"user_id": new_user_id}).eq("site_id", completed_site['site_id']).execute()
        print(f"✅ Transferred ownership of site {completed_site['site_id']} to user {new_user_id}")
        
        # Delete the empty site
        supabase.table("sites").delete().eq("site_id", empty_site_id).execute()
        print(f"✅ Deleted empty site {empty_site_id}")
    else:
        print("\nCould not find both a completed site and a new empty site to reconcile.")

if __name__ == "__main__":
    reconcile()
