"""POST /sim/seed, POST /sim/control, POST /sim/census. Everything from here is labeled SIM."""

import asyncio
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from api.core.db import get_db
from api.core.util import utcnow
from api.dispatch.loop import request_replan, sim_control, world_lock
from api.hazard import fire
from api.sim import seed as sim_seed

router = APIRouter(prefix="/sim", tags=["sim"])
_background: set[asyncio.Task] = set()


def _publish_fire_run(db) -> None:
    """Write the new fire run's detections to Tiger Data without making the seed wait."""

    async def go() -> None:
        doc = await db.hazards.find_one({"_id": fire.RUN_ID})
        if doc:
            await fire.publish(db, fire.run_from_doc(doc))

    task = asyncio.create_task(go())
    _background.add(task)
    task.add_done_callback(_background.discard)


@router.post("/seed")
async def seed(
    scenario: Literal["pocket-fire", "valley-fire"] = Query(
        default="pocket-fire", description="pocket-fire = Oak Creek Canyon; valley-fire = Phoenix metro (~8,000 homes)"
    ),
    homes: int | None = Query(default=None, ge=1, le=20000, description="default: 200 canyon, 8,000 Phoenix"),
    seed: int = Query(default=42, description="random seed: same seed, same world"),
    census: Literal["none", "instant"] = Query(
        default="none", description="instant = answer every home from its persona, no calls"
    ),
    firstArrivalMin: float = Query(default=90, ge=5, description="minutes until the fire reaches the first home"),
) -> dict:
    """Replace the simulated world. Canyon: ~200 homes, 8 vehicles, 2 shelters, 2 zones. Phoenix metro:
    ~8,000 homes, 40 vehicles, 4 shelters, 13 zones. Real households stay."""
    async with world_lock:  # never while a solve is writing offers
        result = await sim_seed.seed(
            get_db(), scenario=scenario, homes=homes, rng_seed=seed, census=census, first_arrival_min=firstArrivalMin
        )
    request_replan()
    _publish_fire_run(get_db())
    return result


@router.post("/census")
async def census(
    perSecond: float = Query(
        default=0, ge=0, le=2000, description="0 = everyone at once; >0 = that many homes a second, fire-first"
    ),
    zones: str | None = Query(default=None, description="comma-separated zone ids (default: every zone)"),
) -> dict:
    """Answer simulated homes that haven't been reached, from their personas (skips the calls).

    With `perSecond`, it runs in the background in waves, homes the fire reaches first going first, so
    the map lights up the way a real call-out would (for demos and the video)."""
    zone_ids = [z for z in (zones or "").split(",") if z] or None
    if perSecond <= 0:
        async with world_lock:
            made = await sim_seed.instant_census(get_db(), zone_ids=zone_ids)
        request_replan()
        return {"requests": made, "simulated": True}

    async def waves() -> None:
        db = get_db()
        batch = max(1, int(perSecond / 2))  # a wave every 0.5 s
        while True:
            async with world_lock:
                left = await db.households.count_documents(
                    {"simulated": True, "reach": "not_called", **({"zoneId": {"$in": zone_ids}} if zone_ids else {})}
                )
                if not left:
                    break
                await sim_seed.instant_census(db, limit=batch, zone_ids=zone_ids)
            request_replan()
            await asyncio.sleep(0.5)

    task = asyncio.create_task(waves())
    _background.add(task)
    task.add_done_callback(_background.discard)
    return {"started": True, "perSecond": perSecond, "zones": zone_ids, "simulated": True}


@router.get("/scenario")
async def scenario() -> dict:
    """Which world is loaded, and the map box to frame it (the console fits its map to this)."""
    from api.sim import data, valley, world

    name = world.active()
    sc = data.scenario(name)
    box = valley.bounds(sc) if name == "valley-fire" else [[-111.835, 34.845], [-111.715, 35.02]]
    return {"name": name, "title": sc.get("title", name), "bounds": box, "simulated": True}


class StandIns(BaseModel):
    voice: bool | None = None
    drivers: bool | None = None
    approval: bool | None = None
    fireZones: bool | None = None


class SimControl(BaseModel):
    standIns: StandIns | None = None
    speedup: float | None = Field(default=None, ge=1, le=600, description="stand-in drivers drive/board N× faster")


@router.post("/control")
async def control(body: SimControl) -> dict:
    """Toggle stand-ins. `approval`: proposals are approved automatically (stand-in dispatcher).
    `drivers`: simulated vehicles accept and drive their runs (api/sim/drivers.py). `voice`:
    stand-in residents. `speedup`: stand-in drivers move and board N× faster (demo)."""
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
