"""Solve loop (D2-04): read open work → greedy plan → write `proposed` assignments + a `plans` doc.

- Re-plans every 5 s while there is open work, every 30 s otherwise, and at once on `request_replan()`
  (road closures call it).
- Only `received` / `reassigning` requests without a live offer are planned. Offered and accepted pickups
  are committed stops: never moved here. Approve / accept / revoke stay in api/assignments.py.
- Stable: a request that keeps the same vehicle keeps its assignment (ETA updated quietly). A new plan
  version is written only when an offer changes, so the console doesn't flicker every 5 s.
- Auto-approve (sim control `standIns.approval`) approves new proposals right away.
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from api import assignments as asg
from api import audit
from api.core.util import aware, new_id, utcnow
from api.dispatch import greedy
from api.sim.geo import Road

log = logging.getLogger(__name__)

PLANNABLE = ("received", "reassigning")
BUSY_EVERY_S, IDLE_EVERY_S = 5.0, 30.0
ETA_QUIET_DELTA_MIN = 1.0

_lock = asyncio.Lock()
_wake = asyncio.Event()


def request_replan() -> None:
    """Ask the loop to re-plan now (road closure, a correction that changes a need)."""
    _wake.set()


def _lonlat(doc: dict[str, Any] | None) -> tuple[float, float] | None:
    c = ((doc or {}).get("location") or {}).get("coordinates")
    return (float(c[0]), float(c[1])) if c else None


def _minutes_until(dt: datetime | None, now: datetime) -> float | None:
    return None if dt is None else (aware(dt) - now).total_seconds() / 60


async def road_with_closures(db: AsyncIOMotorDatabase) -> Road:
    road = Road()
    async for c in db.roadClosures.find({}):
        coords = (c.get("geometry") or {}).get("coordinates") or []
        if len(coords) >= 2:
            road.close_between(tuple(coords[0]), tuple(coords[-1]))
    return road


async def sim_control(db: AsyncIOMotorDatabase) -> dict[str, bool]:
    doc = await db.simControl.find_one({"_id": "sim"}) or {}
    return {"voice": False, "drivers": False, "approval": False, **(doc.get("standIns") or {})}


async def solve_once(db: AsyncIOMotorDatabase, solver: str = "greedy", *, now: datetime | None = None) -> dict:
    async with _lock:
        return await _solve(db, solver, now or utcnow())


async def _solve(db: AsyncIOMotorDatabase, solver: str, now: datetime) -> dict:
    t0 = time.perf_counter()
    road = await road_with_closures(db)

    live = [a async for a in db.assignments.find({"status": {"$in": ["proposed", "offered", "accepted"]}})]
    committed_req_ids = {a["requestId"] for a in live if a["status"] in ("offered", "accepted")}
    proposed = {a["requestId"]: a for a in live if a["status"] == "proposed"}

    reqs = [
        r
        async for r in db.requests.find({"status": {"$in": list(PLANNABLE)}, "dupOf": None})
        if r["_id"] not in committed_req_ids
    ]
    committed_reqs = {r["_id"]: r async for r in db.requests.find({"_id": {"$in": list(committed_req_ids)}})}
    hh_ids = {r["householdId"] for r in reqs} | {r["householdId"] for r in committed_reqs.values()}
    homes = {h["_id"]: h async for h in db.households.find({"_id": {"$in": list(hh_ids)}})}

    def rider(r: dict[str, Any] | None) -> greedy.Rider | None:
        if not r:
            return None
        loc = _lonlat(homes.get(r["householdId"]))
        if loc is None:
            return None
        return greedy.Rider(
            id=r["_id"],
            loc=loc,
            need=greedy.Need.of(r.get("need")),
            deadline_min=_minutes_until(r.get("deadlineAt"), now),
            priority=float(r.get("priority") or 0),
            reassigning=r["status"] == "reassigning",
        )

    vehicles: list[greedy.Vehicle] = []
    async for v in db.vehicles.find({"status": {"$ne": "offline"}}):
        loc = _lonlat(v)
        if loc is None or (v.get("safety") or {}).get("state") in ("man_down", "sos"):
            continue
        mine = sorted(
            (a for a in live if a["vehicleId"] == v["_id"] and a["status"] in ("offered", "accepted")),
            key=lambda a: (a["status"] != "accepted", a.get("stopOrder", 0)),
        )
        cap = v.get("capacity") or {}
        vehicles.append(
            greedy.Vehicle(
                id=v["_id"],
                loc=loc,
                seats=int(cap.get("seats", 4)),
                wheelchair=int(cap.get("wheelchair", 0)),
                stretcher=int(cap.get("stretcher", 0)),
                crew=int(v.get("crew", 1)),
                lift=bool(v.get("lift")),
                committed=[x for a in mine if (x := rider(committed_reqs.get(a["requestId"]))) is not None],
            )
        )

    shelters = []
    async for s in db.shelters.find({}):
        loc = _lonlat(s)
        if loc:
            shelters.append(greedy.Shelter(s["_id"], loc, int(s.get("capacity", 0)) - int(s.get("occupied", 0))))

    riders = [x for r in reqs if (x := rider(r)) is not None]
    result = greedy.plan(riders, vehicles, shelters, road.travel_min)
    solve_ms = round((time.perf_counter() - t0) * 1000, 1)

    # ── diff against the current proposals ─────────────────────────────────
    keep, create, replace = [], [], []
    wanted = {p.request_id: p for p in result.proposals}
    for rid, p in wanted.items():
        cur = proposed.get(rid)
        if cur and cur["vehicleId"] == p.vehicle_id:
            keep.append((cur, p))
        else:
            create.append(p)
            if cur:
                replace.append(cur)
    replace += [a for rid, a in proposed.items() if rid not in wanted]

    version = None
    if create or replace:
        last = await db.plans.find_one(sort=[("version", -1)])
        version = (last["version"] if last else 0) + 1
        for a in replace:
            await db.assignments.update_one(
                {"_id": a["_id"], "status": "proposed"}, {"$set": {"status": "replaced", "respondedAt": now}}
            )
        if create:
            await db.assignments.insert_many(
                [
                    {
                        "_id": new_id("as"),
                        "requestId": p.request_id,
                        "vehicleId": p.vehicle_id,
                        "planVersion": version,
                        "stopOrder": p.stop_order,
                        "etaMinutes": p.eta_min,
                        "status": "proposed",
                        "late": p.late,
                    }
                    for p in create
                ]
            )
        await db.plans.insert_one(
            {
                "_id": new_id("pl"),
                "version": version,
                "solver": "greedy",
                "solveMs": solve_ms,
                "objective": list(result.objective()),
                "changedOffers": len(create) + len(replace),
                "proposals": len(result.proposals),
                "unservable": len(result.unservable),
                "unreachableCommitted": result.unreachable_committed,
                "requested": solver,
                "createdAt": now,
            }
        )
    for cur, p in keep:
        if abs((cur.get("etaMinutes") or 0) - p.eta_min) >= ETA_QUIET_DELTA_MIN or cur.get("late") != p.late:
            await db.assignments.update_one(
                {"_id": cur["_id"], "status": "proposed"},
                {"$set": {"etaMinutes": p.eta_min, "stopOrder": p.stop_order, "late": p.late}},
            )

    # Flag riders nobody reaches in time. Never overwrite a life-threat escalation from the call.
    if result.unservable:
        await db.requests.update_many(
            {"_id": {"$in": result.unservable}, "escalation": None},
            {"$set": {"escalation": "unservable", "updatedAt": now}, "$inc": {"version": 1}},
        )
    if result.unreachable_committed:
        # TODO(D2-06): revoke these with api.assignments.revoke() (only that pickup).
        await audit.log(db, "committed_unreachable", "no route", requestIds=result.unreachable_committed)

    approved = 0
    if (await sim_control(db))["approval"]:
        async for a in db.assignments.find({"status": "proposed"}).sort("etaMinutes", 1):
            try:
                await asg.approve(db, a["_id"], by="stand-in dispatcher")
                approved += 1
            except Exception as e:  # changed under us; next loop picks it up
                log.info("auto-approve skipped %s: %s", a["_id"], e)

    return {
        "version": version,
        "solver": "greedy",
        "requested": solver,
        "solveMs": solve_ms,
        "proposals": len(result.proposals),
        "created": len(create),
        "replaced": len(replace),
        "unservable": len(result.unservable),
        "unreachableCommitted": result.unreachable_committed,
        "autoApproved": approved,
        "objective": list(result.objective()),
    }


async def has_open_work(db: AsyncIOMotorDatabase) -> bool:
    return bool(
        await db.requests.count_documents({"status": {"$in": list(PLANNABLE)}}, limit=1)
        or await db.assignments.count_documents({"status": {"$in": ["proposed", "offered"]}}, limit=1)
    )


async def run(db: AsyncIOMotorDatabase) -> None:
    while True:
        busy = False
        _wake.clear()  # before solving, so a replan asked for mid-solve isn't lost
        try:
            busy = await has_open_work(db)
            if busy:
                await solve_once(db)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("solve loop error")
        try:
            await asyncio.wait_for(_wake.wait(), timeout=BUSY_EVERY_S if busy else IDLE_EVERY_S)
        except TimeoutError:
            pass
