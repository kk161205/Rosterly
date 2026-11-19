from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session as DBSession

from app.core.rate_limit import limit_per_ip
from app.core.request_context import client_ip
from app.core.security import CurrentUser, get_current_user, get_effective_permissions
from app.db.session import get_db
from app.modules.auth.schemas import (
    CurrentUserResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MFACodeRequest,
    MFADisableRequest,
    MFARecoveryCodesResponse,
    MFASetupResponse,
    LoginResponse,
    MessageResponse,
    MFAVerifyRequest,
    RefreshTokenRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.modules.auth import service as auth_service
from app.modules.auth.mfa_service import MfaService

router = APIRouter()


@router.post("/login", response_model=LoginResponse, dependencies=[Depends(limit_per_ip("login", 20, 300))])
def login_endpoint(
    req: LoginRequest,
    request: Request,
    db: DBSession = Depends(get_db),
) -> LoginResponse:
    ip_address = client_ip(request)
    user_agent = request.headers.get("user-agent")
    return auth_service.login(
        db=db,
        email=req.email,
        password=req.password,
        device_fingerprint=req.device_fingerprint,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.post("/mfa/verify", response_model=TokenResponse, dependencies=[Depends(limit_per_ip("mfa", 20, 300))])
def mfa_verify_endpoint(
    req: MFAVerifyRequest,
    request: Request,
    db: DBSession = Depends(get_db),
) -> TokenResponse:
    ip_address = client_ip(request)
    user_agent = request.headers.get("user-agent")
    return auth_service.verify_mfa(
        db=db,
        mfa_session_id=req.mfa_session_id,
        code=req.code,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(limit_per_ip("refresh", 60, 300))])
def refresh_endpoint(
    req: RefreshTokenRequest,
    db: DBSession = Depends(get_db),
) -> TokenResponse:
    return auth_service.refresh_tokens(db=db, raw_refresh_token=req.refresh_token)


@router.post("/forgot-password", response_model=MessageResponse, dependencies=[Depends(limit_per_ip("forgot", 10, 900))])
def forgot_password_endpoint(
    req: ForgotPasswordRequest,
    db: DBSession = Depends(get_db),
) -> MessageResponse:
    return auth_service.forgot_password(db=db, email=req.email)


@router.post("/reset-password", response_model=MessageResponse, dependencies=[Depends(limit_per_ip("reset", 10, 900))])
def reset_password_endpoint(
    req: ResetPasswordRequest,
    request: Request,
    db: DBSession = Depends(get_db),
) -> MessageResponse:
    ip_address = client_ip(request)
    return auth_service.reset_password(
        db=db, token=req.token, new_password=req.new_password, ip_address=ip_address
    )


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


def _mfa(request: Request, current_user: CurrentUser, db: DBSession) -> MfaService:
    return MfaService(db=db, current_user=current_user, ip_address=client_ip(request))


@router.post("/mfa/setup", response_model=MFASetupResponse)
def mfa_setup_endpoint(
    request: Request, current_user: CurrentUser = Depends(get_current_user), db: DBSession = Depends(get_db)
) -> MFASetupResponse:
    """Start setting up two-step sign-in: returns the secret and QR-code URI."""
    return _mfa(request, current_user, db).setup()


@router.post("/mfa/enable", response_model=MFARecoveryCodesResponse)
def mfa_enable_endpoint(
    req: MFACodeRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> MFARecoveryCodesResponse:
    """Confirm setup with a current code; returns one-time recovery codes."""
    return _mfa(request, current_user, db).enable(req.code)


@router.post("/mfa/disable", response_model=MessageResponse)
def mfa_disable_endpoint(
    req: MFADisableRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> MessageResponse:
    """Turn two-step sign-in off (password + current code)."""
    return _mfa(request, current_user, db).disable(req.password, req.code)


@router.get("/me", response_model=CurrentUserResponse)
def get_me_endpoint(
    current_user: CurrentUser = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=str(current_user.user_id),
        email=current_user.email or "",
        full_name=current_user.full_name or "Rosterly User",
        role=current_user.role,
        # Multi-role: primary first, then additional roles; permissions are the union.
        roles=[current_user.role, *sorted(current_user.role_names - {current_user.role})],
        permissions=get_effective_permissions(current_user.role_ids, db),
        department_id=str(current_user.department_id) if current_user.department_id else None,
        mfa_enabled=current_user.mfa_enabled,
        mfa_setup_required=current_user.mfa_setup_required,
        mfa_required_by_company=current_user.mfa_required_by_company,
    )

