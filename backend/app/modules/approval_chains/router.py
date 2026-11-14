"""
Approval Chain Configuration API — project doc §5.18. super_admin only,
enforced via the (approval_chain, *) permissions.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.requests import RequestType
from app.modules.approval_chains.schemas import (
    ChainTemplateCreate,
    ChainTemplateListResponse,
    ChainTemplateResponse,
    ChainTemplateUpdate,
)
from app.modules.approval_chains.service import ApprovalChainService

router = APIRouter()


def get_service(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApprovalChainService:
    client_ip = request.client.host if request.client else "127.0.0.1"
    return ApprovalChainService(db=db, current_user=current_user, ip_address=client_ip)


@router.get("", response_model=ChainTemplateListResponse)
@router.get("/", response_model=ChainTemplateListResponse, include_in_schema=False)
def list_approval_chains(
    request_type: Optional[RequestType] = Query(None),
    service: ApprovalChainService = Depends(get_service),
) -> ChainTemplateListResponse:
    """GET /approval-chains (§5.18): templates with ordered steps and in-flight counts."""
    return service.list_templates(request_type)


@router.post("", response_model=ChainTemplateResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ChainTemplateResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_approval_chain(
    data: ChainTemplateCreate,
    service: ApprovalChainService = Depends(get_service),
) -> ChainTemplateResponse:
    """POST /approval-chains (§5.18)."""
    return service.create_template(data)


@router.put("/{template_id}", response_model=ChainTemplateResponse)
def update_approval_chain(
    template_id: UUID,
    data: ChainTemplateUpdate,
    service: ApprovalChainService = Depends(get_service),
) -> ChainTemplateResponse:
    """PUT /approval-chains/{id} (§5.18): full replace; applies to new requests only."""
    return service.update_template(template_id, data)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_approval_chain(
    template_id: UUID,
    service: ApprovalChainService = Depends(get_service),
) -> Response:
    """DELETE /approval-chains/{id} (§5.18): 409 while a pending request references it."""
    service.delete_template(template_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
