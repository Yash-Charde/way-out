"""Phoenix metro scenario (valley-fire): street-grid travel, closures, seeding, census, solve."""

import math

import pytest

from api.dispatch import loop
from api.sim import seed, world
from api.sim.grid import Grid, manhattan_m


@pytest.fixture(autouse=True)
def _back_to_canyon():
    yield
    world.set_active("pocket-fire")  # other tests assume the canyon


CAVE_CREEK = (-111.951, 33.833)
SCOTTSDALE = (-111.905, 33.618)


def test_grid_travel_is_manhattan():
    g = Grid()
    t = g.travel_min(CAVE_CREEK, SCOTTSDALE)
    assert 20 < t < 40  # ~28 km of section-line driving
    assert g.travel_min(CAVE_CREEK, CAVE_CREEK) == pytest.approx(1.5)
    assert manhattan_m(CAVE_CREEK, SCOTTSDALE) > 24_000


def test_closure_forces_a_detour_around_its_end():
    g = Grid()
    a, b = (-111.90, 33.70), (-111.90, 33.65)  # due south
    before = g.travel_min(a, b)
    g.close_between((-111.95, 33.675), (-111.85, 33.675))  # an east-west street across the way
    after = g.travel_min(a, b)
    assert math.isfinite(after) and after > before + 5


def test_boxed_in_home_is_cut_off():
    g = Grid()
    home, van = (-111.90, 33.70), (-111.90, 33.60)
    for p, q in [
        ((-111.92, 33.69), (-111.88, 33.69)),
        ((-111.92, 33.71), (-111.88, 33.71)),
        ((-111.92, 33.69), (-111.92, 33.71)),
        ((-111.88, 33.69), (-111.88, 33.71)),
    ]:
        g.close_between(p, q)
    assert g.travel_min(van, home) == math.inf
    assert g.step_toward(van, home, 100) is None


def test_stand_in_moves_along_the_streets():
    g = Grid()
    here, there = (-111.95, 33.70), (-111.90, 33.65)
    pos, reached = g.step_toward(here, there, 500)
    assert not reached
    assert pos[1] == pytest.approx(here[1], abs=1e-6) or pos[0] == pytest.approx(here[0], abs=1e-6)  # one axis
    for _ in range(40):
        pos, reached = g.step_toward(pos, there, 500)
        if reached:
            break
    assert reached


def test_off_area():
    g = Grid()
    assert g.off_area_m(CAVE_CREEK) == 0
    assert g.off_area_m((-118.24, 34.05)) > 100_000  # Los Angeles


async def test_seed_valley_world(db):
    out = await seed.seed(db, scenario="valley-fire", homes=1200, rng_seed=3)
    assert world.active() == "valley-fire" and isinstance(world.network(), Grid)
    assert out["households"] == pytest.approx(1200, abs=15)
    assert out["vehicles"] == 40 and out["shelters"] == 4 and len(out["zones"]) == 13
    assert await db.zones.count_documents({"status": "ready"}) == 13
    first = await db.households.find_one(sort=[("fireArrivalAt", 1)])
    assert first["zoneId"] in ("zone_vf_carefree", "zone_vf_cave_creek", "zone_vf_desert_mtn")  # downwind of ignition
    assert "(simulated)" in first["address"]
    assert (await db.simControl.find_one({"_id": "world"}))["scenario"] == "valley-fire"


async def test_census_waves_go_fire_first_and_solve_routes_them(db):
    await seed.seed(db, scenario="valley-fire", homes=1200, rng_seed=3)
    made = await seed.instant_census(db, limit=300)
    assert await db.households.count_documents({"reach": "answered"}) == 300
    answered = [h async for h in db.households.find({"reach": "answered"})]
    waiting = await db.households.find_one({"reach": "not_called"}, sort=[("fireArrivalAt", 1)])
    assert max(h["fireArrivalAt"] for h in answered) <= waiting["fireArrivalAt"]
    res = await loop.solve_once(db)
    assert made > 0 and res["proposals"] > 0
    a = await db.assignments.find_one({"status": "proposed"})
    assert 0 < a["etaMinutes"] < 120


async def test_seeding_the_canyon_switches_back(db):
    await seed.seed(db, scenario="valley-fire", homes=200)
    await seed.seed(db, scenario="pocket-fire", homes=50)
    assert world.active() == "pocket-fire" and not isinstance(world.network(), Grid)
    assert await db.zones.count_documents({}) == 2


async def test_scenario_endpoint(client, db):
    await client.post("/sim/seed", params={"scenario": "valley-fire", "homes": 300})
    s = (await client.get("/sim/scenario")).json()
    assert s["name"] == "valley-fire" and "Phoenix" in s["title"] and len(s["bounds"]) == 2
    res = await client.post("/sim/census", params={"perSecond": 200})
    assert res.json()["started"] is True
