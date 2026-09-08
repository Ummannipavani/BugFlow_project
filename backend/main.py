import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.init_db import init_database
from backend.routers import auth, issues, ai

app = FastAPI(
    title="BugFlow API",
    description="Backend API service for BugFlow 8-week Capstone Project - Issue Tracker",
    version="1.0.0",
)

# CORS setup for React frontend
origins = [
    "*",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Modular Routers
app.include_router(auth.router, prefix="/api")
app.include_router(issues.router, prefix="/api")
app.include_router(ai.router, prefix="/api")


@app.on_event("startup")
def on_startup():
    """Initializes tables and seeds demo data on application launch."""
    try:
        init_database()
    except Exception as err:
        print(f"Database initialization warning: {err}")


@app.get("/")
def root():
    return {
        "status": "online",
        "app": "BugFlow Capstone Backend Service",
        "version": "1.0.0",
        "documentation": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 3000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
