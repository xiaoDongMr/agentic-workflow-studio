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
    supports_reasoning_effort: bool = False
    supports_vision: bool = False
    max_tokens: int | None = None
    timeout: int | None = None


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
                supports_reasoning_effort=model.supports_reasoning_effort,
                supports_vision=model.supports_vision,
                max_tokens=_extract_int(getattr(model, "max_tokens", None)),
                timeout=_extract_int(getattr(model, "timeout", None)),
            )
            for model in app_config.models
        ],
    )


def _extract_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str):
        try:
            parsed = int(value)
        except ValueError:
            return None
        return parsed if parsed > 0 else None
    return None
