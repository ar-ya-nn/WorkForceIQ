from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.analytics import router as analytics_router
from backend.app.attendance import router as attendance_router
from backend.app.audit import router as audit_router
from backend.app.database import get_db
from backend.app.departments import router as departments_router
from backend.app.leave import router as leave_router
from backend.app.predictions import router as predictions_router
from backend.app.users import router as users_router

app = FastAPI(
    title="WorkForceIQ API",
    description="Workforce analytics and HR management system with attrition prediction",
    version="1.0.0",
)

# lets the dashboard (served from a different port) call the API during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(departments_router)
app.include_router(attendance_router)
app.include_router(leave_router)
app.include_router(analytics_router)
app.include_router(audit_router)
app.include_router(predictions_router)


@app.get("/")
def home():
    return {"message": "WorkForceIQ API is running", "docs": "/docs"}


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="Database is not reachable")
    return {"status": "healthy", "database": "connected"}
