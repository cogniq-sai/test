"""
Authentication schemas for login/signup
"""
from pydantic import BaseModel, EmailStr
from typing import Optional


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str


class UserInfo(BaseModel):
    id: str
    email: str
    name: Optional[str] = None


class AuthResponse(BaseModel):
    success: bool
    access_token: Optional[str] = None
    user: Optional[UserInfo] = None
    message: Optional[str] = None
    error: Optional[str] = None
    code: Optional[str] = None
