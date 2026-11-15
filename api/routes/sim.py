"""POST /sim/seed, POST /sim/control, POST /sim/census (Yash: D2-02). Everything from here is labeled SIM."""

from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from api.core.db import get_db
from api.core.util import utcnow
from api.dispatch.loop import request_replan, sim_control, world_lock
from api.sim import seed as sim_seed

router = APIRouter(prefix="/sim", tags=["sim"])


@router.post("/seed")
async def seed(
    scenario: str = Query(default="pocket-fire"),
    homes: int = Query(default=200, ge=1, le=2000),
    seed: int = Query(default=42, description="random seed: same seed, same world"),
    census: Literal["none", "instant"] = Query(
        default="none", description="instant = answer every home from its persona, no calls"
    ),
    firstArrivalMin: float = Query(default=90, ge=5, description="minutes until the fire reaches the first home"),
) -> dict:
    """Replace the simulated world: ~200 homes, 8 vehicles, 2 shelters, 2 zones. Real households stay."""
    async with world_lock:  # never while a solve is writing offers
        result = await sim_seed.seed(
            get_db(), scenario=scenario, homes=homes, rng_seed=seed, census=census, first_arrival_min=firstArrivalMin
        )
    request_replan()
    return result


@router.post("/census")
async def census() -> dict:
    """Answer every simulated home that hasn't been reached, from its persona (skips the calls)."""
    async with world_lock:
        made = await sim_seed.instant_census(get_db())
    request_replan()
    return {"requests": made, "simulated": True}


class StandIns(BaseModel):
    voice: bool | None = None
    drivers: bool | None = None
    approval: bool | None = None


class SimControl(BaseModel):
    standIns: StandIns | None = None
    speedup: float | None = Field(default=None, ge=1, le=600, description="stand-in drivers drive/board N× faster")


@router.post("/control")
async def control(body: SimControl) -> dict:
    """Toggle stand-ins. `approval`: proposals are approved automatically (stand-in dispatcher).
    `drivers`: simulated vehicles accept and drive their runs (api/sim/drivers.py). `voice`: Deep's
    stand-in residents (D1-05). `speedup`: stand-in drivers move and board N× faster (demo)."""
    db = get_db()
    changes: dict = {f"standIns.{k}": v for k, v in (body.standIns or StandIns()).model_dump(exclude_none=True).items()}
    if body.speedup is not None:
        changes["speedup"] = body.speedup
    if changes:
        await db.simControl.update_one({"_id": "sim"}, {"$set": {**changes, "updatedAt": utcnow()}}, upsert=True)
        request_replan()
    return await _control_view(db)


@router.get("/control")
async def get_control() -> dict:
    return await _control_view(get_db())


async def _control_view(db) -> dict:
    doc = await db.simControl.find_one({"_id": "sim"}) or {}
    return {"standIns": await sim_control(db), "speedup": float(doc.get("speedup") or 1.0)}
