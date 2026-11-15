"""Fire → zone status. As the simulated fire approaches, zones move READY → SET → GO by themselves.

A zone's lead time is how long until the front reaches its first home (each home's `fireArrivalAt`, the
same spread model the fire map draws):
  - lead ≤ SET_LEAD_MIN → SET (get ready; the dialer starts calling)
  - lead ≤ GO_LEAD_MIN  → GO  (leave now)
Status only moves forward, so the fire never undoes a SET/GO from TinyFish or a dispatcher, and never
touches a zone marked CLEAR. Changes go through zonewatch.set_zone_status (audit log, dialer) with
`source: "fire"`. Simulated zones only; off with simControl `standIns.fireZones = false`.
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from api.agent import zonewatch
from api.core.util import utcnow
from api.dispatch.loop import sim_control
from api.hazard.fire import RUN_ID

log = logging.getLogger(__name__)

SET_LEAD_MIN = 60
GO_LEAD_MIN = 20
TICK_S = 10
RANK = {"ready": 0, "set": 1, "go": 2}


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def level(lead_min: float) -> str:
    return "go" if lead_min <= GO_LEAD_MIN else "set" if lead_min <= SET_LEAD_MIN else "ready"


async def first_arrivals(db: AsyncIOMotorDatabase) -> dict[str, datetime]:
    """Zone id → when the front reaches the zone's first home."""
    out: dict[str, datetime] = {}
    async for h in db.households.find({"fireArrivalAt": {"$exists": True}}, {"zoneId": 1, "fireArrivalAt": 1}):
        z, t = h.get("zoneId"), h.get("fireArrivalAt")
        if z and t:
            t = _utc(t)
            if z not in out or t < out[z]:
                out[z] = t
    return out


async def levels_at(db: AsyncIOMotorDatabase, at: datetime) -> list[dict[str, Any]]:
    """What the fire alone says each zone should be at `at` (for the map's replay)."""
    if not await db.hazards.find_one({"_id": RUN_ID}, {"_id": 1}):
        return []
    return [
        {
            "zoneId": z,
            "level": level((t - at).total_seconds() / 60),
            "firstArrivalAt": t,
            "leadMin": round((t - at).total_seconds() / 60, 1),
        }
        for z, t in sorted((await first_arrivals(db)).items())
    ]


async def tick(db: AsyncIOMotorDatabase, now: datetime | None = None) -> list[tuple[str, str]]:
    """Escalate simulated zones the fire has come close to. Returns the changes made."""
    if not (await sim_control(db)).get("fireZones", True):
        return []
    now = now or utcnow()
    changes = []
    for z in await levels_at(db, now):
        zone = await db.zones.find_one({"_id": z["zoneId"]}, {"status": 1, "simulated": 1})
        if not zone or not zone.get("simulated"):
            continue
        current = zone.get("status", "ready")
        if current not in RANK or RANK[z["level"]] <= RANK[current]:
            continue  # forward only; CLEAR is left alone
        await zonewatch.set_zone_status(db, z["zoneId"], z["level"], source="fire", source_url=None)
        changes.append((z["zoneId"], z["level"]))
        log.info("fire moved %s %s → %s (front %.0f min away)", z["zoneId"], current, z["level"], z["leadMin"])
    return changes


async def run(db: AsyncIOMotorDatabase) -> None:
    while True:
        try:
            await tick(db)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("fire → zones tick failed")
        await asyncio.sleep(TICK_S)
