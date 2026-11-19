from typing import Optional
from app.core.types import NormalizedEmail
from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    email: NormalizedEmail
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
    # 6-digit authenticator code, or a recovery code (xxxx-xxxx).
    code: str = Field(..., min_length=6, max_length=12)


class MFACodeRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=12)


class MFADisableRequest(BaseModel):
    password: str = Field(..., min_length=1)
    code: str = Field(..., min_length=6, max_length=12)


class MFASetupResponse(BaseModel):
    secret: str  # for typing in by hand when the QR code can't be scanned
    otpauth_uri: str  # drawn as a QR code by the frontend


class MFARecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]  # shown once


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: NormalizedEmail


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=10)

    @field_validator("new_password")
    @classmethod
    def _validate_password_policy(cls, value: str) -> str:
        # Doc: min 10 chars, at least one number and one letter,
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
    role: str  # primary role
    roles: list[str] = [] # every role held, primary first (multi-role)
    permissions: list[str] = []
    department_id: Optional[str] = None
    mfa_enabled: bool = False
    # The company requires two-step sign-in for admin roles and this person
    # hasn't set it up yet: everything but setup is refused until they do.
    mfa_setup_required: bool = False
    mfa_required_by_company: bool = False

