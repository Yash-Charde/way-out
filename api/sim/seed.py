"""POST /sim/seed: the simulated world for a scenario (D2-02). Everything written here has `simulated: true`.

- ~200 households along SR 89A between Midgley Bridge and Pine Flat (Census tract 16.02 covers this
  stretch), each linked to one of Aarya's personas so stand-in calls have a script and a ground truth.
- The mix follows the middle column of docs/story/impact.md: 12% need a ride, 40% of those need a
  wheelchair space or a lift. Homes get a placeholder fire arrival time until api/hazard/ (D2-07).
- 8 vehicles (2 paratransit, 2 agency vans, 4 neighbors), 2 shelters, 2 zones (status `ready`).
- `census="instant"` skips the calls: every home is "answered" with its persona's expected outcome and
  ride requests are created through api.requests. Handy for dispatch work before the dialer exists.
"""

import math
import random
from datetime import timedelta
from typing import Any, Literal

from motor.motor_asyncio import AsyncIOMotorDatabase

from api import audit
from api import requests as rq
from api.core.util import utcnow
from api.sim import data
from api.sim.geo import Road, meters

# docs/story/impact.md, middle column
NEED_RIDE_SHARE = 0.12
HEAVY_SHARE_OF_RIDERS = 0.40

# Homes sit between Midgley Bridge and Pine Flat, denser around the canyon's clusters.
CLUSTERS = [  # (fraction along the tract, weight) Indian Gardens, Slide Rock, West Fork, Pine Flat
    (0.18, 3),
    (0.45, 4),
    (0.75, 3),
    (0.97, 2),
]

FALLBACK_IGNITION = (-111.78, 34.97)

# Fire placeholder (D2-07 replaces): elliptical spread downwind from the ignition point.
HEAD_SPREAD_M_PER_MIN = 60.0
ECCENTRICITY = 0.7

VEHICLES: list[dict[str, Any]] = [
    {
        "_id": "vh_luis",
        "kind": "paratransit",
        "driverName": "Luis",
        "start": "uptown",
        "capacity": {"seats": 4, "wheelchair": 2, "stretcher": 0},
        "crew": 2,
        "lift": True,
    },
    {
        "_id": "vh_maria",
        "kind": "paratransit",
        "driverName": "Maria",
        "start": "west_sedona",
        "capacity": {"seats": 4, "wheelchair": 2, "stretcher": 0},
        "crew": 2,
        "lift": True,
    },
    {
        "_id": "vh_tom",
        "kind": "agency_van",
        "driverName": "Tom",
        "start": "uptown",
        "capacity": {"seats": 8, "wheelchair": 0, "stretcher": 0},
        "crew": 2,
        "lift": False,
    },
    {
        "_id": "vh_ana",
        "kind": "agency_van",
        "driverName": "Ana",
        "start": "y",
        "capacity": {"seats": 8, "wheelchair": 0, "stretcher": 0},
        "crew": 2,
        "lift": False,
    },
    *[
        {
            "_id": f"vh_nb_{i}",
            "kind": "neighbor",
            "driverName": name,
            "start": "neighbor",
            "capacity": {"seats": 3, "wheelchair": 0, "stretcher": 0},
            "crew": 1,
            "lift": False,
        }
        for i, name in enumerate(["Sam", "Priya", "Dave", "Lena"], start=1)
    ],
]

SHELTERS = [
    # Sourced (scenario.json shelter, S-05). Capacity is an assumption.
    {
        "_id": "sh_red_rock_hs",
        "name": "Red Cross shelter, Sedona Red Rock High School",
        "location": (-111.8243, 34.8517),
        "capacity": 150,
    },
    # Assumption: a north-side shelter, reachable only while SR 89A north of Pine Flat is open.
    {
        "_id": "sh_fort_tuthill",
        "name": "Fort Tuthill County Park (assumption)",
        "location": (-111.6950, 35.1390),
        "capacity": 100,
    },
]


def _point(c: tuple[float, float]) -> dict[str, Any]:
    return {"type": "Point", "coordinates": [round(c[0], 6), round(c[1], 6)]}


def _bearing_deg(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlon = math.radians(b[0] - a[0])
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def fire_minutes(home: tuple[float, float], ignition: tuple[float, float], wind_from_deg: float) -> float:
    """Minutes for the front to reach `home`: fastest downwind, slowest upwind (elliptical spread)."""
    downwind = (wind_from_deg + 180) % 360
    theta = math.radians(_bearing_deg(ignition, home) - downwind)
    speed = HEAD_SPREAD_M_PER_MIN * (1 - ECCENTRICITY) / (1 - ECCENTRICITY * math.cos(theta))
    return meters(ignition, home) / speed


def _pick_persona(rng: random.Random, groups: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    r = rng.random()
    if r < NEED_RIDE_SHARE * HEAVY_SHARE_OF_RIDERS and groups["ride_chair"]:
        g = "ride_chair"
    elif r < NEED_RIDE_SHARE and groups["ride"]:
        g = "ride"
    else:
        g = "other" if groups["other"] else "ride"
    return rng.choice(groups[g])


def _priority(record: dict[str, Any], need: dict[str, Any]) -> float:
    """Same spirit as the agent's transparent score: heavier needs and medical needs go first."""
    return (
        1.0
        + 2 * (need.get("wheelchair") or 0)
        + 3 * (need.get("stretcher") or 0)
        + (1 if need.get("lift") else 0)
        + 1.5 * len(record.get("medical") or [])
    )


async def reset(db: AsyncIOMotorDatabase) -> dict[str, int]:
    """Delete the simulated world. Real households (simulated: false, e.g. the judge's phone) stay."""
    sim_hh = [h["_id"] async for h in db.households.find({"simulated": True}, {"_id": 1})]
    sim_rq = [r["_id"] async for r in db.requests.find({"householdId": {"$in": sim_hh}}, {"_id": 1})]
    sim_vh = [v["_id"] async for v in db.vehicles.find({"simulated": True}, {"_id": 1})]
    out = {
        "assignments": (
            await db.assignments.delete_many({"$or": [{"requestId": {"$in": sim_rq}}, {"vehicleId": {"$in": sim_vh}}]})
        ).deleted_count,
        "callbacks": (await db.callbacks.delete_many({"requestId": {"$in": sim_rq}})).deleted_count,
        "calls": (await db.calls.delete_many({"householdId": {"$in": sim_hh}})).deleted_count,
        "requests": (await db.requests.delete_many({"_id": {"$in": sim_rq}})).deleted_count,
        "households": (await db.households.delete_many({"_id": {"$in": sim_hh}})).deleted_count,
        "vehicles": (await db.vehicles.delete_many({"_id": {"$in": sim_vh}})).deleted_count,
    }
    for coll in ("shelters", "plans", "roadClosures", "hazards"):
        out[coll] = (await db[coll].delete_many({})).deleted_count
    return out


async def seed(
    db: AsyncIOMotorDatabase,
    *,
    scenario: str = "pocket-fire",
    homes: int = 200,
    rng_seed: int = 42,
    census: Literal["none", "instant"] = "none",
    first_arrival_min: float = 90.0,
) -> dict[str, Any]:
    rng = random.Random(rng_seed)
    sc = data.scenario(scenario)
    road = Road()
    now = utcnow()

    removed = await reset(db)

    # ── zones: south half (14) and north half (15) of the tract ──────────────
    tract_from = road.project((-111.7497, 34.8875))[0]  # Midgley Bridge
    tract_to = road.project((-111.7383, 35.0122))[0]  # Pine Flat
    split = road.project((-111.7529, 34.9437))[0]  # Slide Rock
    zone_meta = {z["id"]: z for z in sc.get("zones", [])}
    zone_ids = list(zone_meta) or ["zone_oak_creek_14", "zone_oak_creek_15"]
    zone_south, zone_north = zone_ids[0], zone_ids[-1]
    for zid, (c1, c2) in ((zone_south, (tract_from, split)), (zone_north, (split, tract_to))):
        z = zone_meta.get(zid, {})
        await db.zones.update_one(
            {"_id": zid},
            {
                "$set": {
                    "name": z.get("name", zid),
                    "county": z.get("county", "Coconino"),
                    "status": "ready",
                    "polygon": {"type": "Polygon", "coordinates": [road.corridor(c1, c2, 600)]},
                    "source": "manual",
                    "simulated": True,
                    "updatedAt": now,
                }
            },
            upsert=True,
        )

    # ── households ──────────────────────────────────────────────────────────
    groups: dict[str, list[dict[str, Any]]] = {"ride_chair": [], "ride": [], "other": []}
    for p in data.personas():
        groups[data.persona_group(p)].append(p)

    ignition = tuple(sc.get("ignition", FALLBACK_IGNITION))
    wind_from = float((sc.get("wind") or {}).get("fromDeg", 225))
    span = tract_to - tract_from
    raw: list[tuple[float, dict[str, Any], tuple[float, float]]] = []
    for _ in range(homes):
        if rng.random() < 0.6:
            frac = rng.choices(CLUSTERS, weights=[w for _, w in CLUSTERS])[0][0]
            frac = min(1.0, max(0.0, rng.gauss(frac, 0.05)))
        else:
            frac = rng.random()
        ch = tract_from + frac * span
        offset = rng.choice((-1, 1)) * rng.uniform(40, 300)
        loc = road.point_at(ch, offset)
        raw.append((fire_minutes(loc, ignition, wind_from), _pick_persona(rng, groups), loc))

    earliest = min(m for m, _, _ in raw)
    docs: list[dict[str, Any]] = []
    for i, (fire_min, persona, loc) in enumerate(sorted(raw, key=lambda r: road.project(r[2])[0])):
        ch = road.project(loc)[0]
        arrival = now + timedelta(minutes=first_arrival_min + (fire_min - earliest))
        docs.append(
            {
                "_id": f"hh_sim_{i:03d}",
                "address": f"{1000 + int(ch / 8)} N State Route 89A, Sedona, AZ 86336",
                "location": _point(loc),
                "zoneId": zone_south if ch < split else zone_north,
                "phone": f"+1555{i:07d}",  # fictional
                "language": persona.get("language", "en"),
                "simulated": True,
                "personaId": persona["id"],
                "record": {},
                "corrections": [],
                "reach": "not_called",
                "role": "unknown",
                "fireArrivalAt": arrival,
                "deadlineAt": arrival - timedelta(minutes=10),
                "doorPriority": 0.0,
                "updatedAt": now,
            }
        )
    await db.households.insert_many(docs)

    # ── vehicles ────────────────────────────────────────────────────────────
    starts = {"uptown": (-111.7615, 34.8705), "west_sedona": (-111.8000, 34.8610), "y": (-111.7650, 34.8635)}
    helpers = [d for d in docs if data.persona_group(_persona(d["personaId"])) == "other"]
    neighbor_homes = rng.sample(helpers or docs, k=min(4, len(helpers or docs)))
    nb = iter(neighbor_homes)
    vehicles = []
    for v in VEHICLES:
        if v["start"] == "neighbor":
            home = next(nb, None)
            loc = tuple(home["location"]["coordinates"]) if home else starts["uptown"]
        else:
            loc = starts[v["start"]]
        vehicles.append(
            {
                **{k: val for k, val in v.items() if k != "start"},
                "phone": "",
                "location": _point(loc),
                "heading": 0,
                "speedMps": 0,
                "status": "idle",
                "safety": {"state": "ok"},
                "simulated": True,
                "lastSeenAt": now,
            }
        )
    await db.vehicles.insert_many(vehicles)

    await db.shelters.insert_many(
        [{**s, "location": _point(s["location"]), "occupied": 0, "simulated": True} for s in SHELTERS]
    )

    requests = await instant_census(db) if census == "instant" else 0
    await audit.log(db, "sim_seeded", scenario, homes=len(docs), vehicles=len(vehicles), census=census)
    return {
        "scenario": scenario,
        "households": len(docs),
        "vehicles": len(vehicles),
        "shelters": len(SHELTERS),
        "zones": [zone_south, zone_north],
        "requests": requests,
        "removed": removed,
        "simulated": True,
    }


def _persona(pid: str) -> dict[str, Any]:
    for p in data.personas():
        if p["id"] == pid:
            return p
    return {}


async def instant_census(db: AsyncIOMotorDatabase) -> int:
    """Answer every simulated, not-yet-reached home with its persona's expected outcome. → requests made."""
    made = 0
    async for hh in db.households.find({"simulated": True, "reach": "not_called"}):
        p = _persona(hh.get("personaId", ""))
        truth = {k: v for k, v in (p.get("truth") or {}).items() if v is not None}
        expect = p.get("expect") or {}
        role = expect.get("role") or "unknown"
        await db.households.update_one(
            {"_id": hh["_id"]},
            {"$set": {"record": truth, "reach": "answered", "role": role, "updatedAt": utcnow()}},
        )
        if role == "needs_ride":
            need = {
                "seats": max(1, int(truth.get("peopleCount") or 1)),
                "wheelchair": 0,
                "stretcher": 0,
                "crew": 1,
                "lift": False,
                **(expect.get("need") or {}),
            }
            await rq.upsert_for_household(
                db, hh["_id"], need=need, deadline_at=hh.get("deadlineAt"), priority=_priority(truth, need)
            )
            made += 1
    return made
