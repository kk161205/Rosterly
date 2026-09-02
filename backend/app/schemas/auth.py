from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)
    device_fingerprint: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    token_type: str = "bearer"
    mfa_required: bool = False
    mfa_session_id: Optional[str] = None


class MFAVerifyRequest(BaseModel):
    mfa_session_id: str
    code: str = Field(..., min_length=6, max_length=6)


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=10)

    @field_validator("new_password")
    @classmethod
    def _validate_password_policy(cls, value: str) -> str:
        # Doc §7 rule 9: min 10 chars, at least one number and one letter,
        # enforced server-side as the source of truth.
        if not any(c.isalpha() for c in value):
            raise ValueError("Password must contain at least one letter")
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one number")
        return value


class MessageResponse(BaseModel):
    message: str


class CurrentUserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    permissions: list[str] = []
    department_id: Optional[str] = None

