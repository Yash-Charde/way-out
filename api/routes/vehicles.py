"""Vehicles (Yash: D2-05, D2-08): list, a driver's run, phone presence, position, safety.

A phone that has the driver app open (presence or position in the last PHONE_FRESH_S) owns its vehicle:
stand-in drivers (api/sim/drivers.py) leave it alone.
"""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api import audit
from api.core.db import get_db
from api.core.util import utcnow
from api.routes._util import out

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

PHONE_FRESH_S = 120


@router.get("")
async def list_vehicles() -> list[dict]:
    return [out(v) async for v in get_db().vehicles.find({})]


async def _with_home(db, a: dict[str, Any]) -> dict[str, Any]:
    req = await db.requests.find_one({"_id": a["requestId"]}) or {}
    hh = await db.households.find_one({"_id": req.get("householdId")}) or {}
    return {
        **out(a),
        "request": {
            "id": req.get("_id"),
            "status": req.get("status"),
            "need": req.get("need"),
            "deadlineAt": req.get("deadlineAt"),
            "escalation": req.get("escalation"),
        },
        "household": {
            "id": hh.get("_id"),
            "address": hh.get("address"),
            "location": hh.get("location"),
            "language": hh.get("language"),
            "simulated": hh.get("simulated"),
        },
    }


@router.get("/{vehicle_id}/run")
async def run(vehicle_id: str) -> dict:
    """What the driver app shows: live offers (with countdown) and the accepted run, in stop order."""
    db = get_db()
    v = await db.vehicles.find_one({"_id": vehicle_id})
    if v is None:
        raise HTTPException(404, "vehicle not found")
    offers = [
        await _with_home(db, a)
        async for a in db.assignments.find({"vehicleId": vehicle_id, "status": "offered"}).sort("expiresAt", 1)
    ]
    stops = [
        await _with_home(db, a)
        async for a in db.assignments.find({"vehicleId": vehicle_id, "status": "accepted"}).sort("stopOrder", 1)
    ]
    shelters = [out(s) async for s in db.shelters.find({})]
    return {"vehicle": out(v), "offers": offers, "run": stops, "shelters": shelters, "now": utcnow()}


@router.post("/{vehicle_id}/presence")
async def presence(vehicle_id: str) -> dict:
    """The driver app is open on a phone (sent every ~20 s). Stand-in drivers skip this vehicle."""
    res = await get_db().vehicles.update_one({"_id": vehicle_id}, {"$set": {"phoneSeenAt": utcnow()}})
    if not res.matched_count:
        raise HTTPException(404, "vehicle not found")
    return {"ok": True}


class PositionBody(BaseModel):
    lon: float
    lat: float
    heading: float = 0
    speedMps: float = 0


@router.post("/{vehicle_id}/position")
async def position(vehicle_id: str, body: PositionBody) -> dict:
    # TODO(D2-07): also append to Tiger Data `vehicle_positions`.
    res = await get_db().vehicles.update_one(
        {"_id": vehicle_id},
        {
            "$set": {
                "location": {"type": "Point", "coordinates": [body.lon, body.lat]},
                "heading": body.heading,
                "speedMps": body.speedMps,
                "lastSeenAt": utcnow(),
                "phoneSeenAt": utcnow(),  # only phones post positions over HTTP
            }
        },
    )
    if not res.matched_count:
        raise HTTPException(404, "vehicle not found")
    return {"ok": True}


class SafetyBody(BaseModel):
    state: Literal["ok", "check", "man_down", "sos"]
    lon: float | None = None
    lat: float | None = None


@router.post("/{vehicle_id}/safety")
async def safety(vehicle_id: str, body: SafetyBody) -> dict:
    db = get_db()
    doc: dict[str, Any] = {"state": body.state, "at": utcnow()}
    if body.lon is not None and body.lat is not None:
        doc["location"] = {"type": "Point", "coordinates": [body.lon, body.lat]}
    res = await db.vehicles.update_one({"_id": vehicle_id}, {"$set": {"safety": doc}})
    if not res.matched_count:
        raise HTTPException(404, "vehicle not found")
    if body.state in ("man_down", "sos"):
        await audit.log(db, "driver_safety", body.state, vehicleId=vehicle_id)
    return {"ok": True}
