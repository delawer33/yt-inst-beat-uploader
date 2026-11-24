"""The Effects the owner can pick, and what the Visual Lab loads (``GET /api/effects``)."""

from fastapi import APIRouter

from beat_server.api.schemas import EffectOut, EffectsOut
from beat_upload.visual import EFFECTS, effect_files

router = APIRouter(prefix="/api/effects", tags=["effects"])


@router.get("", response_model=EffectsOut)
def list_effects() -> EffectsOut:
    """Every Effect in picker order, Still first; ``files`` are the effect files under
    ``/visual/effects/`` in load order, for the Visual Lab."""
    return EffectsOut(
        effects=[EffectOut(id=e.id, name=e.name, blurb=e.blurb) for e in EFFECTS],
        files=[f.name for f in effect_files()],
    )
