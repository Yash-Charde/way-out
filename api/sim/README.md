# api/sim/ — simulated world

- `seed.py`: `POST /sim/seed?scenario=pocket-fire` → ~200 households, 8 vehicles, 2 shelters, 2 zones (`simulated: true`)
- `data.py`: reads `data/scenario.json` and `data/personas.json`; small built-ins if they're missing
- `geo.py`: SR 89A polyline road model and travel times
- `drivers.py`: simulated drivers accept after 6 s and drive their routes, one move per second at 35 km/h × speedup
  (parked cars drive their side street out to SR 89A first)
- Drive test: `POST /sim/drive-test?speedup=10` (or **Drive test** on the console) seeds a fresh world and starts the
  fleet; `python scripts/drive_test.py --api <url>` prints every car's position and measured speed each second;
  `api/tests/test_movement.py` checks the same second by second
- `compare.py`: impact comparison (911 queue vs Way Out greedy), low/middle/high settings, 50 seeds each →
  `data/sim-results.json`. Run: `uv run --project api python -m api.sim.compare`. Settings and results:
  `docs/simulation.md`

Everything from here is labeled **SIM** in the UI.

## Phoenix metro scenario (`valley-fire`)

`POST /sim/seed?scenario=valley-fire` (the web's default) loads a simulated North Valley Fire: ignition in
the Tonto National Forest foothills north-east of Cave Creek, a north-east wind pushing it into the Valley's
wildland-urban edge. `data/scenario-valley-fire.json` holds it.

- **13 zones** on the metro's edge (Cave Creek, Carefree, North Scottsdale, Fountain Hills, Anthem, New River,
  Rio Verde, Ahwatukee, Verrado, Gold Canyon, ...). Approximate boxes, not official zones.
- **~8,000 homes** on local streets, **40 vehicles**, **4 shelters**. Same persona mix and fire model as the canyon.
- **Travel:** `api/sim/grid.py`, Manhattan distance on Phoenix's section-line grid (40 km/h first 8 km, then
  65 km/h, +1.5 min to an arterial). Closures snap to one east-west or north-south street and act as
  barriers; trips detour around their ends or are cut off.
- **Census waves:** `POST /sim/census?perSecond=250` answers homes fire-first in the background so the map
  lights up like a real call-out.
- `api/sim/world.py` remembers the active scenario (`simControl` doc `world`); the solver, stand-in drivers
  and closures ask it for the network. `scenario=pocket-fire` brings the canyon back.
