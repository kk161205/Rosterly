from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session as DBSession

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.schemas.auth import (
    CurrentUserResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    MFAVerifyRequest,
    RefreshTokenRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.services import auth_service

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login_endpoint(
    req: LoginRequest,
    request: Request,
    db: DBSession = Depends(get_db),
) -> LoginResponse:
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return auth_service.login(
        db=db,
        email=req.email,
        password=req.password,
        device_fingerprint=req.device_fingerprint,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.post("/mfa/verify", response_model=TokenResponse)
def mfa_verify_endpoint(
    req: MFAVerifyRequest,
    request: Request,
    db: DBSession = Depends(get_db),
) -> TokenResponse:
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return auth_service.verify_mfa(
        db=db,
        mfa_session_id=req.mfa_session_id,
        code=req.code,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_endpoint(
    req: RefreshTokenRequest,
    db: DBSession = Depends(get_db),
) -> TokenResponse:
    return auth_service.refresh_tokens(db=db, raw_refresh_token=req.refresh_token)


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password_endpoint(
    req: ForgotPasswordRequest,
    db: DBSession = Depends(get_db),
) -> MessageResponse:
    return auth_service.forgot_password(db=db, email=req.email)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password_endpoint(
    req: ResetPasswordRequest,
    db: DBSession = Depends(get_db),
) -> MessageResponse:
    return auth_service.reset_password(db=db, token=req.token, new_password=req.new_password)


@router.post("/logout", response_model=MessageResponse)
def logout_endpoint(
    current_user: CurrentUser = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> MessageResponse:
    return auth_service.logout_session(db=db, session_id=current_user.session_id)


@router.post("/logout-all-devices", response_model=MessageResponse)
def logout_all_devices_endpoint(
    current_user: CurrentUser = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> MessageResponse:
    return auth_service.logout_all_user_sessions(db=db, user_id=current_user.user_id)


@router.get("/me", response_model=CurrentUserResponse)
def get_me_endpoint(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=str(current_user.user_id),
        email=current_user.email or "",
        full_name=current_user.full_name or "Rosterly User",
        role=current_user.role,
    )

