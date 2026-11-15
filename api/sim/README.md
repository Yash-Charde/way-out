# api/sim/ — stand-ins (Yash, D2-02 / D2-09)

- `seed.py`: `POST /sim/seed?scenario=pocket-fire` → ~200 households, 8 vehicles, 2 shelters (`simulated: true`)
- `drivers.py`: stand-in drivers accept after 6 s and drive their routes
- `compare.py`: impact comparison (today's 911 queue vs Way Out greedy), low/middle/high settings from `docs/story/impact.md`, 50 seeds each → `data/sim-results.json`. Run: `uv run --project api python -m api.sim.compare`

Everything from here is labeled **SIM** in the UI.
