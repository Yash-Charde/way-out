"""GET /hazards, POST /hazards/photo."""

from fastapi import APIRouter

from api.core.db import get_db
from api.routes._util import not_yet, out

router = APIRouter(prefix="/hazards", tags=["hazards"])


@router.get("")
async def list_hazards() -> dict:
    """TODO: add the fire front and per-home deadlines from api/hazard/spread.py."""
    db = get_db()
    return {
        "hazards": [out(h) async for h in db.hazards.find({})],
        "closures": [out(c) async for c in db.roadClosures.find({})],
        "shelters": [out(x) async for x in db.shelters.find({})],
        # zone outlines (GET /zones leaves the polygon out); live status still comes from zone.updated
        "zones": [out(z) async for z in db.zones.find({}, {"name": 1, "status": 1, "polygon": 1})],
    }


@router.post("/photo")
async def photo() -> dict:
    """multipart image + lon/lat → Gemini vision → hazard."""
    raise not_yet("photo hazard reports")
