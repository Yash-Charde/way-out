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
- **Bars:** "Today (911 queue)" vs "Greedy dispatch" vs "Way Out (OR-Tools)".
- **Each bar:** median over at least 20 runs, with a whisker from min to max across the low/middle/high settings.
- **Label:** "Simulated: 200 homes, Oak Creek Canyon scenario" under the chart.
- Use **blue for Way Out and orange for the baseline** (not red/green), and write the number on each bar.

## What we will **not** claim

- Lives saved. We can say "picked up before the deadline in simulation", nothing more.
- That the fire model is a forecast. It's a scenario input.
- Any number that isn't on `/system` or in `data/sim-results.json` at 5 AM.
