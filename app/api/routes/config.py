from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.deps import get_app_config

router = APIRouter()


class ModelOption(BaseModel):
    name: str
    display_name: str | None = None
    description: str | None = None
    supports_thinking: bool = False
    supports_vision: bool = False


class ModelOptionsResponse(BaseModel):
    models: list[ModelOption]


@router.get("/config/models", response_model=ModelOptionsResponse)
async def list_model_options(request: Request) -> ModelOptionsResponse:
    app_config = get_app_config(request)
    return ModelOptionsResponse(
        models=[
            ModelOption(
                name=model.name,
                display_name=model.display_name,
                description=model.description,
                supports_thinking=model.supports_thinking,
                supports_vision=model.supports_vision,
            )
            for model in app_config.models
        ],
    )
