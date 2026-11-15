# Impact numbers (A-09) — assumptions sheet

Agree these with Yash **before** he runs the sim, so the numbers on slide 7 and Devpost come from settings we can defend. Every value is either **sourced** (ID in `sources.md`) or marked **assumption**; run the low and high values, not just the middle, and report the **median with a range**.

| Setting | Low | Middle | High | Basis |
|---|---|---|---|---|
| Homes in the zone | 200 | 200 | 200 | Demo size (simulated). Real canyon: 650 occupied households (C-01) |
| Share of homes that answer the first call | 40% | 60% | 75% | **Sourced anchor:** Harris County reached 605 of 1,030 registrants (59%) after Hurricane Beryl (F-18). Low/high are assumptions |
| Homes that need a ride | 8% | 12% | 18% | **Assumption** from C-01: 12.1% of residents have an ambulatory disability; 3.1% of households have no car; 34.9% are a 65+ person living alone |
| Of those, need a wheelchair / two-person lift | 30% | 40% | 50% | **Assumption** |
| Fleet | 4 vehicles (1 wheelchair van) | 8 (2 vans, 2 paratransit, 4 neighbors) | 12 | Contract seeds 8 vehicles (`/sim/seed`). Assumption |
| Boarding time: walks / walker / wheelchair / two-person lift | 2 / 4 / 8 / 12 min | 3 / 6 / 10 / 15 min | 5 / 8 / 15 / 20 min | **Assumption** (ask a responder if anyone gets the chance) |
| "Today" baseline: how people who can't leave get help | They call 911 and wait in the queue | | | Model 911 as one queue; LAFD saw 2.4× normal call volume in the 2025 fires (F-14) |
| Minutes after the order that a 911 caller gets a vehicle | 30 | 60 | 120 | **Assumption.** Eaton: west Altadena's order came after ≥14 fire reports (F-13); keep this clearly labeled |
| Time from order to fire arrival at the nearest homes | 45 min | 90 min | 180 min | **Assumption** from the scenario spread model, not a forecast |

## The one chart (slide 7 / Devpost)

- **Y:** % of people who needed a ride and were picked up before their deadline.
- **Bars:** "Today (911 queue)" vs "Way Out (greedy dispatch)". Two bars: the OR-Tools bar is P1 and not built (`sim-results.json` → `available: false`).
- **Each bar:** median over at least 20 runs, with a whisker from min to max across the low/middle/high settings.
- **Label:** "Simulated: 200 homes, Oak Creek Canyon scenario" under the chart.
- Use **blue for Way Out and orange for the baseline** (not red/green), and write the number on each bar.

## Results (from `data/sim-results.json`, PR #58)

Simulated: 200 homes, Oak Creek Canyon scenario. Metric: share of people who needed a ride picked up before their deadline (10 minutes before the fire reaches the home). 50 runs per setting, 150 in all.

| Bar | Low | Middle (headline) | High |
|---|---|---|---|
| Today (911 queue) | 36.6% | **47.6%** | 52.7% |
| Way Out (greedy dispatch) | 86.2% | **90.9%** | 95.9% |

Headline (X-01): **91% vs 48%**, range 86–96% vs 37–53% across the three settings.

**Read the baseline correctly.** Yash's notes on the run:

- **Today is modeled as generously as possible.** Every person who needs a ride calls 911 (`todayCallShare: 1.0`), as this sheet's row 13 says. Yash's task file used 55%; that is kept as an extra comparison: today drops to **33.8%** (middle; 26.5–39.3%) (X-02).
- **911 dispatches agency vehicles only** (`today911FleetExcludesNeighbors: true`). If 911 could also send the neighbor cars, today reaches **65.6%** (middle; 57.1–67.3%) (X-03). Way Out still leads by about 25 points, so the gain is not only from adding neighbors.
- **"Greedy" is Way Out's own dispatcher**, not a baseline. Compare against "today's 911 queue".

Assumptions Yash added beyond this sheet (all in the file's `assumptions` block): 60 calls/min, 2.5 min per answered call, retries at 2 and 5 min then a text, door check at 30 min, 2 min from approve to driver accept, 5 min to unload, SR 89A as one road at 35 km/h with side streets at 15 km/h, and the elliptical fire spread from the scenario (a scenario input, not a forecast).

## What we will **not** claim

- Lives saved. We can say "picked up before the deadline in simulation", nothing more.
- That the fire model is a forecast. It's a scenario input.
- Any number that isn't on `/system` or in `data/sim-results.json` at 5 AM.
