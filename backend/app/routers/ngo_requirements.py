from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_ngo
from app.models.organization import NGO, NGORequirement
from app.schemas.redistribution import RequirementCreate, RequirementPatch, RequirementResponse
from app.services.ngo_requirements import describe_requirement, owned_requirement, save_requirement

router = APIRouter(prefix="/api/v1/ngo-requirements", tags=["NGO Requirements"])


@router.post("", status_code=201, response_model=RequirementResponse)
def create(payload: RequirementCreate, ngo: NGO = Depends(get_current_ngo), db: Session = Depends(get_db)):
    return save_requirement(db, ngo.id, payload)


@router.get("", response_model=list[RequirementResponse])
def listing(ngo: NGO = Depends(get_current_ngo), db: Session = Depends(get_db)):
    return [describe_requirement(db, row) for row in db.scalars(
        select(NGORequirement).where(NGORequirement.ngo_id == ngo.id).order_by(NGORequirement.id.desc())
    )]


@router.get("/{requirement_id}", response_model=RequirementResponse)
def detail(requirement_id: int, ngo: NGO = Depends(get_current_ngo), db: Session = Depends(get_db)):
    return describe_requirement(db, owned_requirement(db, ngo.id, requirement_id))


@router.patch("/{requirement_id}", response_model=RequirementResponse)
def update(requirement_id: int, payload: RequirementPatch, ngo: NGO = Depends(get_current_ngo),
           db: Session = Depends(get_db)):
    return save_requirement(db, ngo.id, payload, owned_requirement(db, ngo.id, requirement_id, lock=True))


@router.delete("/{requirement_id}", status_code=204)
def close(requirement_id: int, ngo: NGO = Depends(get_current_ngo), db: Session = Depends(get_db)):
    row = owned_requirement(db, ngo.id, requirement_id, lock=True)
    row.is_active = False
    db.commit()
    return Response(status_code=204)
