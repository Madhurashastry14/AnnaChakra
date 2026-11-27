from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from app.core.database import engine
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.delivery_personnel import router as delivery_personnel_router
from app.routers.food_items import router as food_items_router
from app.routers.forecasts import router as forecasts_router
from app.routers.kitchens import router as kitchens_router
from app.routers.meal_records import router as meal_records_router
from app.routers.ngos import router as ngos_router
from app.routers.vision import router as vision_router
from app.routers.waste import router as waste_router

app = FastAPI(
    title="AnnaChakra API",
    description="AI-powered food waste management platform",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(kitchens_router)
app.include_router(ngos_router)
app.include_router(delivery_personnel_router)
app.include_router(food_items_router)
app.include_router(forecasts_router)
app.include_router(meal_records_router)
app.include_router(admin_router)
app.include_router(vision_router)
app.include_router(waste_router)


@app.get("/health", tags=["Health"])
def health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "service": "AnnaChakra API",
            "database": "connected"
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed"
        )
