import os
import sys

# Add the current directory to sys.path so we can import 'app'
sys.path.append(os.getcwd())

from app.database import get_supabase
from dotenv import load_dotenv

load_dotenv()

try:
    client = get_supabase()
    # Access internal headers of the postgrest client to see the token
    token = client.table("sites")._client.options.headers.get("Authorization")
    print(f"Auth Header: {token[:30]}...{token[-10:] if token else 'None'}")
    
    # Try a simple query
    r = client.table("sites").select("*").limit(1).execute()
    print("Success!")
except Exception as e:
    print(f"Error: {e}")
