import os
from dotenv import load_dotenv

# Try to load .env relative to this script
load_dotenv()

print(f"Loaded SUPABASE_URL: {os.getenv('SUPABASE_URL')}")
key = os.getenv('SUPABASE_ANON_KEY')
if key:
    print(f"Loaded SUPABASE_ANON_KEY (length): {len(key)}")
    # Payload decoding check
    import base64
    import json
    try:
        payload_part = key.split('.')[1]
        # Base64 padding
        missing_padding = len(payload_part) % 4
        if missing_padding:
            payload_part += '=' * (4 - missing_padding)
        payload = json.loads(base64.b64decode(payload_part))
        print(f"Token Payload: {payload}")
        import datetime
        print(f"IAT: {datetime.datetime.fromtimestamp(payload['iat'])}")
        print(f"EXP: {datetime.datetime.fromtimestamp(payload['exp'])}")
        print(f"Current System Time: {datetime.datetime.now()}")
    except Exception as e:
        print(f"Error decoding token: {e}")
else:
    print("SUPABASE_ANON_KEY not found in environment!")
