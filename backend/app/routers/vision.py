import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.formparsers import MultiPartException

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_kitchen
from app.models.organization import Kitchen
from app.schemas.forecast import PositiveID
from app.schemas.vision import CountResponse, VisionResponse
from pydantic import BaseModel, ConfigDict
from app.services.vision import accept_upload, image_path, owned_prediction, recount

logger = logging.getLogger(__name__)


class UploadLimitRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def bounded(request: Request):
            if request.method != "POST":
                return await handler(request)
            limit = settings.VISION_MAX_BYTES + 64 * 1024
            length = request.headers.get("content-length")
            if length and length.isdecimal() and int(length) > limit:
                raise HTTPException(413, "Multipart request exceeds the upload limit")
            consumed = 0

            async def receive():
                nonlocal consumed
                message = await request.receive()
                consumed += len(message.get("body", b""))
                if consumed > limit:
                    # This exception also causes Starlette's parser to close partial uploads.
                    raise MultiPartException("Multipart request exceeds the upload limit")
                return message

            try:
                return await handler(Request(request.scope, receive=receive))
            except HTTPException as exc:
                if consumed > limit:
                    raise HTTPException(413, "Multipart request exceeds the upload limit") from exc
                raise

        return bounded


router = APIRouter(prefix="/api/v1/vision", tags=["Vision"], route_class=UploadLimitRoute)


@router.post("/analyze", response_model=VisionResponse)
@router.post("/predict", response_model=VisionResponse)
def recognize(image: UploadFile = File(...), kitchen: Kitchen = Depends(get_current_kitchen),
              db: Session = Depends(get_db)):
    try:
        result = accept_upload(db, kitchen.id, image)
    except (OSError, SQLAlchemyError) as exc:
        db.rollback()
        logger.error("Vision upload failed (%s)", type(exc).__name__)
        raise HTTPException(500, "Unable to save the image") from exc
    return result | {"confidence_score": result["confidence"]}


class CountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    food_item_id: PositiveID


@router.post("/predictions/{prediction_id}/count", response_model=CountResponse)
def count_selected(prediction_id: str, request: CountRequest,
                   kitchen: Kitchen = Depends(get_current_kitchen), db: Session = Depends(get_db)):
    try:
        return recount(db, kitchen.id, prediction_id, request.food_item_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(500, "Unable to save the count") from exc


@router.get("/images/{prediction_id}")
def retrieve(prediction_id: str, kitchen: Kitchen = Depends(get_current_kitchen),
             db: Session = Depends(get_db)):
    row = owned_prediction(db, kitchen.id, prediction_id)
    path = image_path(row)
    if not path.is_file():
        raise HTTPException(404, "Image not found")
    return FileResponse(path, media_type=f"image/{row.image_format.casefold()}",
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
