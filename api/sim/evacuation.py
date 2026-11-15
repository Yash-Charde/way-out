"""Evacuation replay: the whole night, planned once, as timelines the console can play back.

What it is: the loaded world (homes, census answers, fleet, shelters, fire) run forward from ignition with
the same pieces the live system uses: the batched planner (api/dispatch/batch.py, shelter round trips
included), the same street-grid/road travel times, the same boarding and unloading minutes. Nothing is
written to the database. Every number in the summary is counted from these timelines, so the replay
and its counters can't disagree.

Timeline (minutes from the warning, i.e. when the world was seeded):
- CALL_MIN: every home has been called (the AI calls everyone at once) and the answers are in.
- Homes that can leave on their own drive to the nearest shelter, leaving over the next LEAVE_SPREAD_MIN.
- Riders: the planner gives each vehicle its run; vehicles drive it, drop off at a shelter whenever the
  next rider wouldn't fit, and end at a shelter. A rider is safe at the drop-off.
- The fire: the same simulated detections as the fire replay; its outline every FIRE_FRAME_MIN.

Scenario input, not a forecast. Everything here is simulated.
"""

import math
import random
from datetime import datetime, timedelta
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from api.core.util import aware
from api.dispatch import batch, greedy
from api.hazard import fire, spread
from api.sim import world

CALL_MIN = 10.0
LEAVE_SPREAD_MIN = 20.0
FIRE_FRAME_MIN = 5.0
DEADLINE_BUFFER_MIN = 10.0  # same as requests: be gone 10 min before the fire
CHUNK = 120  # riders per planning round (keeps each Hungarian solve small)

LonLat = tuple[float, float]


def _r(x: float, n: int = 5) -> float:
    return round(float(x), n)


def _leg(net: Any, a: LonLat, b: LonLat, t: float) -> tuple[list[list[float]], float]:
    """Waypoints [lon, lat, minute] from a to b starting at minute t, along the network; → (points, arrival)."""
    total = net.travel_min(a, b)
    if not math.isfinite(total):
        return [[_r(b[0]), _r(b[1]), round(t, 2)]], t
    corners: list[LonLat] = []
    if hasattr(net, "route_xy"):  # street grid: the L-shaped (or detour) path
        from api.sim.grid import lonlat, xy

        path = net.route_xy(xy(a), xy(b)) or [xy(a), xy(b)]
        pts = [lonlat(p) for p in path]
        corners = pts[1:-1]
    seq = [a, *corners, b]
    dist = [abs(p[0] - q[0]) + abs(p[1] - q[1]) for p, q in zip(seq, seq[1:], strict=False)]
    whole = sum(dist) or 1.0
    out, acc = [], 0.0
    for p, d in zip(seq[1:], dist, strict=False):
        acc += d
        out.append([_r(p[0]), _r(p[1]), round(t + total * acc / whole, 2)])
    return out, t + total


def _nearest(net: Any, here: LonLat, shelters: list[greedy.Shelter]) -> greedy.Shelter:
    return min(shelters, key=lambda s: net.travel_min(here, s.loc))


async def build(db: AsyncIOMotorDatabase, *, rng_seed: int = 42) -> dict[str, Any]:
    net = world.network()
    doc = await db.hazards.find_one({"_id": fire.RUN_ID})
    if doc is None:
        return {"error": "No fire yet. Seed a world first."}
    run = fire.run_from_doc(doc)
    # Minute 0 = when the world was seeded: the warning goes out and the calls start. The fire may ignite
    # before or after that (seed's firstArrivalMin sets how long until it reaches the first home).
    t0: datetime = aware(doc.get("seededAt")) or run.ignited_at

    def minute(dt: Any) -> float | None:
        d = aware(dt)
        return None if d is None else (d - t0).total_seconds() / 60

    homes = [h async for h in db.households.find({}, {"location": 1, "role": 1, "fireArrivalAt": 1, "reach": 1})]
    reqs = {r["householdId"]: r async for r in db.requests.find({}, {"householdId": 1, "need": 1})}
    shelters = []
    async for s in db.shelters.find({}):
        c = (s.get("location") or {}).get("coordinates")
        if c:
            shelters.append(greedy.Shelter(s["_id"], (c[0], c[1]), int(s.get("capacity", 0))))
    fleet = [v async for v in db.vehicles.find({"status": {"$ne": "offline"}})]
    if not shelters or not fleet:
        return {"error": "This world has no shelters or vehicles."}

    rng = random.Random(rng_seed)
    fire_at: dict[str, float | None] = {h["_id"]: minute(h.get("fireArrivalAt")) for h in homes}
    loc = {h["_id"]: tuple(h["location"]["coordinates"]) for h in homes if h.get("location")}

    # ── riders: everyone who said they need a ride (census answers), planned once at CALL_MIN ──
    rider_homes = [h for h in homes if h.get("role") == "needs_ride" and h["_id"] in loc]
    riders: list[greedy.Rider] = []
    for h in rider_homes:
        fa = fire_at[h["_id"]]
        need = greedy.Need.of((reqs.get(h["_id"]) or {}).get("need"))
        dl = None if fa is None else fa - DEADLINE_BUFFER_MIN - CALL_MIN
        riders.append(greedy.Rider(id=h["_id"], loc=loc[h["_id"]], need=need, deadline_min=dl))
    rider_by_id = {r.id: r for r in riders}
    vehicles = []
    for v in fleet:
        c = (v.get("location") or {}).get("coordinates")
        cap = v.get("capacity") or {}
        if not c:
            continue
        vehicles.append(
            greedy.Vehicle(
                id=v["_id"],
                loc=(c[0], c[1]),
                seats=int(cap.get("seats", 4)),
                wheelchair=int(cap.get("wheelchair", 0)),
                stretcher=int(cap.get("stretcher", 0)),
                crew=int(v.get("crew", 1)),
                lift=bool(v.get("lift")),
            )
        )
    # Rolling horizon, like the live loop: the most urgent CHUNK riders at a time, each vehicle keeping
    # the riders it already has (committed stops are never reordered).
    by_vehicle: dict[str, list[greedy.Proposal]] = {}
    queue = sorted(riders, key=lambda r: r.deadline_min if r.deadline_min is not None else math.inf)
    for k in range(0, len(queue), CHUNK):
        result = batch.plan(queue[k : k + CHUNK], vehicles, shelters, net.travel_min)
        rid = {r.id: r for r in queue[k : k + CHUNK]}
        for p in result.proposals:
            by_vehicle.setdefault(p.vehicle_id, []).append(p)
        for v in vehicles:
            mine = sorted(by_vehicle.get(v.id, []), key=lambda p: p.stop_order)
            v.committed = [rid.get(p.request_id) or rider_by_id[p.request_id] for p in mine]

    # ── drive every run: same rule as the planner (full → nearest shelter first), log each move ──
    out_vehicles, out_riders = [], {}
    for vi, v in enumerate(vehicles):
        meta = next(x for x in fleet if x["_id"] == v.id)
        here, t = v.loc, CALL_MIN
        path = [[_r(here[0]), _r(here[1]), t]]
        loads: list[list[float]] = [[t, 0]]
        onboard: list[greedy.Rider] = []

        def drop(
            here: LonLat,
            t: float,
            path: list[list[float]] = path,
            onboard: list[greedy.Rider] = onboard,
            loads: list[list[float]] = loads,
        ) -> tuple[LonLat, float]:
            sh = _nearest(net, here, shelters)
            pts, t = _leg(net, here, sh.loc, t)
            path.extend(pts)
            for r in onboard:
                out_riders[r.id]["drop"] = round(t, 2)
                out_riders[r.id]["shelter"] = sh.id
            t += greedy.UNLOAD_MIN
            path.append([_r(sh.loc[0]), _r(sh.loc[1]), round(t, 2)])
            onboard.clear()
            loads.append([round(t, 2), 0])
            return sh.loc, t

        for p in sorted(by_vehicle.get(v.id, []), key=lambda p: p.stop_order):
            r = rider_by_id[p.request_id]
            used = [sum(x.need.seats for x in onboard), sum(x.need.wheelchair for x in onboard),
                    sum(x.need.stretcher for x in onboard)]  # fmt: skip
            if onboard and (
                used[0] + r.need.seats > v.seats
                or used[1] + r.need.wheelchair > v.wheelchair
                or used[2] + r.need.stretcher > v.stretcher
            ):
                here, t = drop(here, t)
            pts, t = _leg(net, here, r.loc, t)
            path.extend(pts)
            pickup = t
            t += r.need.board_min()
            path.append([_r(r.loc[0]), _r(r.loc[1]), round(t, 2)])
            here = r.loc
            onboard.append(r)
            loads.append([round(pickup, 2), sum(x.need.seats for x in onboard)])
            out_riders[r.id] = {"vehicle": vi, "pickup": round(pickup, 2), "seats": r.need.seats}
        if onboard:
            here, t = drop(here, t)
        out_vehicles.append(
            {
                "id": v.id,
                "name": meta.get("driverName") or v.id,
                "kind": meta.get("kind"),
                "seats": v.seats,
                "path": path,
                "loads": loads,
                "riders": len(by_vehicle.get(v.id, [])),
            }
        )

    # ── homes that leave on their own: to the nearest shelter, spread over LEAVE_SPREAD_MIN ──
    self_evac, stayed, unreached, rider_rows = [], [], [], []
    # People driving themselves go to the general shelters; the medical one is kept for riders.
    names = {s["_id"]: str(s.get("name", "")) async for s in db.shelters.find({}, {"name": 1})}
    general = [s for s in shelters if "medical" not in names.get(s.id, "").lower()] or shelters
    for h in homes:
        hid = h["_id"]
        if hid not in loc:
            continue
        lo, la = loc[hid]
        fa = fire_at[hid]
        role = h.get("role")
        if role == "needs_ride":
            x = out_riders.get(hid)
            if x is None:  # no vehicle can carry this need (e.g. a stretcher and no ambulance)
                rider_rows.append([_r(lo), _r(la), None, None, -1, fa])
            else:
                rider_rows.append([_r(lo), _r(la), x["pickup"], x.get("drop"), x["vehicle"], fa])
        elif role in ("left", "can_help"):
            leave = CALL_MIN + rng.random() * LEAVE_SPREAD_MIN
            sh = _nearest(net, (lo, la), general)
            pts, arrive = _leg(net, (lo, la), sh.loc, leave)
            self_evac.append([_r(lo), _r(la), round(leave, 2), [p for q in pts for p in q], fa])
        elif role == "stay":
            stayed.append([_r(lo), _r(la), fa])
        else:
            unreached.append([_r(lo), _r(la), fa])

    # ── fire outline every FIRE_FRAME_MIN, from the same detections as the fire replay ──
    dets = sorted(fire._detections(run), key=lambda d: d.time)
    last_safe = max(
        [r[3] for r in rider_rows if r[3] is not None] + [s[3][-1] for s in self_evac] + [CALL_MIN], default=CALL_MIN
    )
    end = min(spread.REPLAY_HOURS * 60, math.ceil((last_safe + 30) / FIRE_FRAME_MIN) * FIRE_FRAME_MIN)
    frames, pts, i = [], [run.ignition], 0  # hull starts at the ignition point
    k = 0.0
    while k <= end:
        cut = t0 + timedelta(minutes=k)
        while i < len(dets) and dets[i].time <= cut:
            pts.append((dets[i].lon, dets[i].lat))
            i += 1
        ring = spread.hull(pts) if len(pts) > 2 and cut >= run.ignited_at else []
        frames.append({"t": k, "ring": [[_r(x), _r(y)] for x, y in ring]})
        k += FIRE_FRAME_MIN

    on_time = sum(1 for r in rider_rows if r[2] is not None and (r[5] is None or r[2] <= r[5]))
    late = sum(1 for r in rider_rows if r[2] is not None and r[5] is not None and r[2] > r[5])
    no_vehicle = sum(1 for r in rider_rows if r[2] is None)
    self_late = sum(1 for s in self_evac if s[4] is not None and s[2] > s[4])
    fire_first = min((f for f in fire_at.values() if f is not None), default=None)
    return {
        "t0": t0,
        "callMin": CALL_MIN,
        "endMin": end,
        "fire": frames,
        "vehicles": out_vehicles,
        "riders": rider_rows,  # [lon, lat, pickupMin, dropMin, vehicleIndex (-1 none), fireMin]
        "selfEvac": self_evac,  # [lon, lat, leaveMin, [lon, lat, min, …], fireMin]
        "stayed": stayed,  # [lon, lat, fireMin]
        "unreached": unreached,
        "summary": {
            "homes": len(loc),
            "riders": len(rider_rows),
            "ridersOutBeforeFire": on_time,
            "ridersLate": late,
            "ridersNoVehicle": no_vehicle,
            "selfEvac": len(self_evac),
            "selfEvacLate": self_late,
            "stayed": len(stayed),
            "unreached": len(unreached),
            "lastSafeMin": round(last_safe, 1),
            "firstFireMin": None if fire_first is None else round(fire_first, 1),
            "vehicles": len(out_vehicles),
            "maxLoadOverSeats": max(
                (max((ld[1] for ld in v["loads"]), default=0) - v["seats"] for v in out_vehicles), default=0
            ),
        },
        "simulated": True,
    }
