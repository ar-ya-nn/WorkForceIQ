from fastapi import FastAPI

from backend.app.users import router as users_router
from backend.app.departments import router as departments_router
from backend.app.attendance import router as attendance_router


app = FastAPI(
    title="WorkForceIQ API",
    description="AI-powered workforce management system",
    version="1.0.0"
)


app.include_router(users_router)
app.include_router(departments_router)
app.include_router(attendance_router)


@app.get("/")
def home():
    return {
        "message": "WorkForceIQ API is running"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }