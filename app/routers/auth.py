"""
Authentication router - Login, Signup, Token verification
"""
from fastapi import APIRouter
from datetime import datetime, timedelta
import jwt
import os
from dotenv import load_dotenv

from app.database import get_supabase
from app.schemas.auth import LoginRequest, SignupRequest, AuthResponse, UserInfo

load_dotenv()

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this")
ALGORITHM = "HS256"
EXPIRATION_HOURS = 24


@router.post("/signup", response_model=AuthResponse, summary="Register New User")
def signup(request: SignupRequest):
    """
    Create new user account
    
    - Creates user in Supabase Auth
    - Stores user metadata (first_name, last_name)
    """
    try:
        supabase = get_supabase()
        
        response = supabase.auth.sign_up({
            "email": request.email.strip(),
            "password": request.password.strip(),
            "options": {
                "data": {
                    "first_name": request.first_name.strip(),
                    "last_name": request.last_name.strip(),
                    "display_name": f"{request.first_name.strip()} {request.last_name.strip()}",
                    "full_name": f"{request.first_name.strip()} {request.last_name.strip()}",
                }
            },
        })
        
        return AuthResponse(
            success=True,
            message="Signup successful! Please login to continue."
        )
        
    except Exception as e:
        error_msg = str(e).lower()
        
        if "already registered" in error_msg or "user already exists" in error_msg:
            return AuthResponse(
                success=False,
                error="User already exists. Please login.",
                code="USER_EXISTS"
            )
        
        return AuthResponse(success=False, error=str(e))


@router.post("/login", response_model=AuthResponse, summary="User Login")
def login(request: LoginRequest):
    """
    Login user and return JWT token
    
    - Validates credentials with Supabase
    - Returns JWT token for subsequent requests
    """
    try:
        supabase = get_supabase()
        
        response = supabase.auth.sign_in_with_password({
            "email": request.email.strip(),
            "password": request.password.strip(),
        })
        
        # Generate JWT token
        token = jwt.encode(
            {
                "user_id": str(response.user.id),
                "email": response.user.email,
                "exp": datetime.utcnow() + timedelta(hours=EXPIRATION_HOURS),
            },
            SECRET_KEY,
            algorithm=ALGORITHM,
        )
        
        return AuthResponse(
            success=True,
            access_token=token,
            user=UserInfo(
                id=str(response.user.id),
                email=response.user.email,
                name=response.user.user_metadata.get("display_name")
            )
        )
        
    except Exception:
        return AuthResponse(
            success=False,
            error="Invalid email or password"
        )


@router.post("/validate-token", summary="Validate Access Token")
def validate_token(token: str):
    """Verify if a JWT token is valid and returns user information."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {
            "valid": True,
            "user_id": payload.get("user_id"),
            "email": payload.get("email"),
        }
    except:
        return {"valid": False, "error": "Invalid or expired token"}
