from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "PhysioTwin AI"
    env: str = "dev"
    api_prefix: str = "/api"

    database_url: str = "sqlite:///./physiotwin.db"

    jwt_secret: str = "CHANGE_ME"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 30

    frontend_origin: str = "http://localhost:3000"


settings = Settings()


