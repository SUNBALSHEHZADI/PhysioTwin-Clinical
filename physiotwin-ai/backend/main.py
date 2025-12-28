from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from core.config import settings
from database.session import init_db


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_prefix)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()


@app.on_event("startup")
def _startup():
    init_db()


