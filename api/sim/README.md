# api/sim/ — simulated world

- `seed.py`: `POST /sim/seed?scenario=pocket-fire` → ~200 households, 8 vehicles, 2 shelters, 2 zones (`simulated: true`)
- `data.py`: reads `data/scenario.json` and `data/personas.json`; small built-ins if they're missing
- `geo.py`: SR 89A polyline road model and travel times
- `drivers.py`: simulated drivers accept after 6 s and drive their routes
- `compare.py`: impact comparison (911 queue vs Way Out greedy), low/middle/high settings, 50 seeds each →
  `data/sim-results.json`. Run: `uv run --project api python -m api.sim.compare`. Settings and results:
  `docs/simulation.md`

Everything from here is labeled **SIM** in the UI.
