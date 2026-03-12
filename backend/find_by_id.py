import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
supabase = create_client(url, key)

def find_by_id(site_id):
    print(f"--- Fetching Site Details for ID: {site_id} ---")
    res = supabase.table("sites").select("*").eq("site_id", site_id).execute()
    
    if not res.data:
        print("No site found with that ID.")
        return

    site = res.data[0]
    print(f"\nSITE DETAILS:")
    print(f"  ID: {site['site_id']}")
    print(f"  Name: {site['site_name']}")
    print(f"  URL: {site['site_url']}")
    print(f"  API Key: {site.get('api_key', 'Not generated yet')}")
    print(f"  User ID: {site['user_id']}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        find_by_id(sys.argv[1])
    else:
        print("Usage: python find_by_id.py <site_id>")
