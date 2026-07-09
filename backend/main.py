from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import router as auth_router
from app.datasets import router as datasets_router
from app.config import get_settings


settings = get_settings()

app = FastAPI(title="OMELET Lab API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(datasets_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "soft_web_backend"}
