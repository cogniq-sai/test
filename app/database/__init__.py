"""
Database module initialization
Provides get_supabase() function for database access
"""
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_supabase_client: Client = None


def get_supabase() -> Client:
    """Get or create Supabase client singleton"""
    global _supabase_client
    
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_ANON_KEY")
        
        if not url or not key:
            raise Exception("Missing SUPABASE_URL or SUPABASE_ANON_KEY")
        
        _supabase_client = create_client(url, key)
    
    return _supabase_client

