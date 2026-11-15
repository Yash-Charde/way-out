"""The `valley-fire` world: the Phoenix metro's wildland-urban edge. Everything here is simulated.

- 13 zones: approximate boxes around real communities on the metro's edge (Cave Creek, Carefree, North
  Scottsdale, Fountain Hills, Anthem, New River, Rio Verde, Ahwatukee, Verrado, Gold Canyon, ...).
  Not official evacuation zones.
- ~8,000 homes (scenario `defaultHomes`), shared out by each zone's weight, denser toward the middle of
  the community and lined up on local streets (Phoenix's 1/8-mile grid), so the map reads like a city.
- Same persona mix and fire model as the canyon (api/sim/seed.py): 12% need a ride, 40% of those need a
  wheelchair space or a lift; each home's deadline = fire arrival − 10 min.
- 40 vehicles: 6 paratransit vans with lifts, 6 agency vans, 2 buses, 26 neighbors (homes that can help).
- 4 shelters (simulated) around the Valley.
"""

import random
from datetime import datetime, timedelta
from typing import Any, Literal

from motor.motor_asyncio import AsyncIOMotorDatabase

from api import audit
from api.core.util import new_id
from api.sim import data
from api.sim import seed as base
from api.sim.grid import lonlat, xy

STREET_M = 201.0  # 1/8 mile: Phoenix local streets
STREETS = [
    "Desert Vista Trl",
    "Saguaro Rd",
    "Ocotillo Dr",
    "Palo Verde Ln",
    "Mesquite St",
    "Jojoba Rd",
    "Cholla Dr",
    "Ironwood Way",
    "Quail Run",
    "Coyote Pass",
    "Sunrise Dr",
    "Lone Mountain Rd",
]
NAMED = [
    ("vh_luis", "paratransit", "Luis", "cave_creek"),
    ("vh_maria", "paratransit", "Maria", "north_scottsdale"),
    ("vh_tom", "agency_van", "Tom", "cave_creek"),
    ("vh_ana", "agency_van", "Ana", "scottsdale_airpark"),
]
EXTRA_PARATRANSIT = ["Rosa M.", "Kevin", "Imani", "Jorge"]
EXTRA_VANS = ["Hector", "Beth", "Omar", "Grace"]
BUSES = [("vh_bus_1", "Bus 1 · Ray", "deer_valley"), ("vh_bus_2", "Bus 2 · Lin", "anthem")]
NEIGHBOR_NAMES = [
    "Sam",
    "Priya",
    "Dave",
    "Lena",
    "Marcus",
    "Elena",
    "Noah",
    "Fatima",
    "Chris",
    "Aiko",
    "Diego",
    "Hannah",
    "Raj",
    "Tess",
    "Malik",
    "Sofia",
    "Ben",
    "Yara",
    "Luca",
    "Nina",
    "Owen",
    "Zoe",
    "Ezra",
    "Maya",
    "Cole",
    "Ivy",
]


def zone_polygon(z: dict[str, Any], rng: random.Random) -> list[list[float]]:
    """An 8-sided outline around the zone's box, a little irregular so it doesn't look drawn with a ruler."""
    cx, cy = xy(tuple(z["center"]))
    hw, hh = z["widthKm"] * 500, z["heightKm"] * 500
    pts = [(-1, -0.6), (-0.6, -1), (0.6, -1), (1, -0.6), (1, 0.6), (0.6, 1), (-0.6, 1), (-1, 0.6)]
    ring = []
    for ux, uy in pts:
        j = 1 + rng.uniform(-0.08, 0.08)
        lon, lat = lonlat((cx + ux * hw * j, cy + uy * hh * j))
        ring.append([round(lon, 6), round(lat, 6)])
    return [*ring, ring[0]]


def place_home(z: dict[str, Any], rng: random.Random) -> tuple[float, float]:
    """Denser toward the middle, snapped onto a local street (east-west or north-south)."""
    cx, cy = xy(tuple(z["center"]))
    hw, hh = z["widthKm"] * 450, z["heightKm"] * 450
    x = min(hw, max(-hw, rng.gauss(0, hw / 2.2)))
    y = min(hh, max(-hh, rng.gauss(0, hh / 2.2)))
    if rng.random() < 0.5:
        y = round(y / STREET_M) * STREET_M + rng.uniform(-12, 12)
    else:
        x = round(x / STREET_M) * STREET_M + rng.uniform(-12, 12)
    return lonlat((cx + x, cy + y))


def _address(rng: random.Random, z: dict[str, Any]) -> str:
    town = z["name"].split(" · ")[-1].split(" / ")[0]
    return f"{rng.randint(10, 399) * 100 + rng.randint(1, 99)} E {rng.choice(STREETS)}, {town}, AZ (simulated)"


def _vehicle(_id: str, kind: str, name: str, loc: tuple[float, float], now: datetime) -> dict[str, Any]:
    cap = {
        "paratransit": ({"seats": 4, "wheelchair": 2, "stretcher": 0}, 2, True),
        "agency_van": ({"seats": 8, "wheelchair": 0, "stretcher": 0}, 2, False),
        "bus": ({"seats": 30, "wheelchair": 1, "stretcher": 0}, 2, True),
        "neighbor": ({"seats": 3, "wheelchair": 0, "stretcher": 0}, 1, False),
    }[kind]
    return {
        "_id": _id,
        "kind": kind,
        "driverName": name,
        "capacity": cap[0],
        "crew": cap[1],
        "lift": cap[2],
        "phone": "",
        "location": base._point(loc),
        "heading": 0,
        "speedMps": 0,
        "status": "idle",
        "safety": {"state": "ok"},
        "simulated": True,
        "lastSeenAt": now,
    }


async def seed(
    db: AsyncIOMotorDatabase,
    sc: dict[str, Any],
    *,
    homes: int | None,
    rng: random.Random,
    now: datetime,
    census: Literal["none", "instant"],
    first_arrival_min: float,
) -> dict[str, Any]:
    homes = homes or int(sc.get("defaultHomes", 8000))
    removed = await base.reset(db)

    zones = sc["zones"]
    for z in zones:
        await db.zones.update_one(
            {"_id": z["id"]},
            {
                "$set": {
                    "name": z["name"],
                    "county": z.get("county", "Maricopa"),
                    "status": "ready",
                    "polygon": {"type": "Polygon", "coordinates": [zone_polygon(z, rng)]},
                    "source": "manual",
                    "simulated": True,
                    "updatedAt": now,
                }
            },
            upsert=True,
        )
    await db.zones.delete_many({"_id": {"$nin": [z["id"] for z in zones]}, "simulated": True})

    groups: dict[str, list[dict[str, Any]]] = {"ride_chair": [], "ride": [], "other": []}
    for p in data.personas():
        groups[data.persona_group(p)].append(p)

    ignition = tuple(sc["ignition"])
    wind_from = float(sc["wind"]["fromDeg"])
    total_w = sum(z["weight"] for z in zones)
    raw: list[tuple[float, dict[str, Any], tuple[float, float], dict[str, Any]]] = []
    for z in zones:
        for _ in range(round(homes * z["weight"] / total_w)):
            loc = place_home(z, rng)
            raw.append((base.fire_minutes(loc, ignition, wind_from), base._pick_persona(rng, groups), loc, z))

    earliest = min(m for m, _, _, _ in raw)
    ignited_at = now + timedelta(minutes=first_arrival_min - earliest)
    taken = {h["_id"] async for h in db.households.find({"_id": {"$regex": "^hh_sim_"}}, {"_id": 1})}
    docs: list[dict[str, Any]] = []
    for i, (fire_min, persona, loc, z) in enumerate(sorted(raw, key=lambda r: r[0])):
        arrival = now + timedelta(minutes=first_arrival_min + (fire_min - earliest))
        docs.append(
            {
                "_id": base._free_id(f"hh_sim_{i:05d}", taken),
                "address": _address(rng, z),
                "location": base._point(loc),
                "zoneId": z["id"],
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
    for k in range(0, len(docs), 2000):
        await db.households.insert_many(docs[k : k + 2000], ordered=False)

    from api.hazard import fire
    from api.hazard.spread import FireRun

    run = FireRun(new_id("fire"), sc["name"], (float(ignition[0]), float(ignition[1])), wind_from, ignited_at)
    await db.hazards.replace_one({"_id": fire.RUN_ID}, fire.run_doc(run), upsert=True)

    # ── vehicles ────────────────────────────────────────────────────────────
    stage = {k: tuple(v) for k, v in sc["staging"].items()}
    spots = list(stage.values())
    vehicles = [_vehicle(i, kind, name, stage[at], now) for i, kind, name, at in NAMED]
    vehicles += [
        _vehicle(f"vh_para_{n}", "paratransit", name, spots[n % len(spots)], now)
        for n, name in enumerate(EXTRA_PARATRANSIT, start=1)
    ]
    vehicles += [
        _vehicle(f"vh_van_{n}", "agency_van", name, spots[(n + 2) % len(spots)], now)
        for n, name in enumerate(EXTRA_VANS, start=1)
    ]
    vehicles += [_vehicle(i, "bus", name, stage[at], now) for i, name, at in BUSES]
    # Neighbors: homes that can help, in the zones the fire reaches first (they're already there).
    in_path = [d for d in docs[: len(docs) // 2] if data.persona_group(base._persona(d["personaId"])) == "other"]
    helpers = rng.sample(in_path or docs, k=min(len(NEIGHBOR_NAMES), len(in_path or docs)))
    for n, (name, home) in enumerate(zip(NEIGHBOR_NAMES, helpers, strict=False), start=1):
        vehicles.append(_vehicle(f"vh_nb_{n}", "neighbor", name, tuple(home["location"]["coordinates"]), now))
    await db.vehicles.insert_many(vehicles)

    shelters = sc["shelters"]
    await db.shelters.insert_many(
        [{**s, "location": base._point(tuple(s["location"])), "occupied": 0, "simulated": True} for s in shelters]
    )

    requests = await base.instant_census(db) if census == "instant" else 0
    await audit.log(db, "sim_seeded", sc["name"], homes=len(docs), vehicles=len(vehicles), census=census)
    return {
        "scenario": sc["name"],
        "households": len(docs),
        "vehicles": len(vehicles),
        "shelters": len(shelters),
        "fire": {"runId": run.run_id, "ignitedAt": ignited_at},
        "zones": [z["id"] for z in zones],
        "requests": requests,
        "removed": removed,
        "simulated": True,
    }


def bounds(sc: dict[str, Any]) -> list[list[float]]:
    b = sc.get("bounds")
    if b:
        return b
    lons = [z["center"][0] for z in sc["zones"]]
    lats = [z["center"][1] for z in sc["zones"]]
    return [[min(lons) - 0.1, min(lats) - 0.1], [max(lons) + 0.1, max(lats) + 0.1]]
