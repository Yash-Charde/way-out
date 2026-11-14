# Yash: responder side (console, driver app, dispatch, fire map, simulation)

**You own:** everything dispatchers and drivers see and decide, plus the simulated world.
**Folders:** `web/` (except the kiosk, `/calls`, `/system`, `/drill`), `api/dispatch/`, `api/hazard/`, `api/sim/`, `api/routes/{plans,vehicles,roads,hazards,sim}.py`
**Hours:** 11:10 AM → 5:00 AM (sleep 5–7 AM) → 7:00 AM onward for the demo.
**While Prem is away (2 PM–1 AM)** you also own core/infra fixes (`api/requests.py`, deploys).

Read first: `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`, `docs/CONTRACT.md` §1–§3.

> **Sat 3:45 PM: you also own D2-10 (go live)**, the repo-owner half of Prem's P-04. It takes about 15 minutes once Aarya hands over (target 5:15 PM). Only the repo owner can add Actions secrets or connect Vercel to a personal repo, so it has to be you. Keep going on D2-02 and D2-04 until then.

---

## UI direction (this is what judges remember)
- **Dark, map-first, calm.** MapLibre GL basemap (dark style) + **deck.gl** layers:
  - `ScatterplotLayer` homes, colored by `role` (red = needs a ride, amber = can help, green = out, grey = not reached). Pulse on change
  - `PolygonLayer` fire front with a soft glow, plus the hatched SET/GO zone outline
  - **`TripsLayer`** vehicles with fading trails (this is the "data flowing" shot), `PathLayer` routes
  - `IconLayer` shelters, closures, SOS
- **Console layout:** top bar (incident clock, zone status chip SET/GO, counters: called / answered / need ride / on a van / out). Left drawer: requests sorted by deadline (time left as a shrinking bar). Right drawer: proposed plan (Approve all, or per row), fleet, door-knock list, safety alerts. Drawers collapse. The map is never covered by more than 30%.
- **Driver app (`/driver`, phone, PWA): Uber-style.** Full-screen map → bottom sheet with the **offer card** (address, needs as icons: 🦽 ×1, crew 2, O₂; ETA; countdown ring) → big **Accept** / Decline → run list with numbered stops → swipe **"Picked up"**. A top banner shows fire distance and trend ("Fire 400 m NE · closing in"). **Hold for SOS.**
- Keyboard on the console: `A` approve selected, `J/K` move, `F` focus fire, `Esc` close drawer.
- Animated counters (number tweening), toasts for safety alerts, no layout jumps. Everything simulated has a small "SIM" badge.

## Tasks

| ID | Time | Task | Done when |
|---|---|---|---|
| **D2-01** | 11:10–12:30 | **Web scaffold.** Next.js (App Router) + Tailwind + shadcn/ui + MapLibre + deck.gl. Dark theme tokens. `lib/api.ts`, **`lib/live.ts`** (WebSocket to `/live` with reconnect + a Zustand store per collection). Page shells: `/console`, `/driver`, `/calls`, `/system`, `/`, `/report`. Vercel project linked | Preview URL renders the map over Oak Creek Canyon |
| **D2-02** | 12:30–2:30 | **Simulated world** (`api/sim/`). `POST /sim/seed?scenario=pocket-fire`: road graph of Sedona + Oak Creek Canyon from OSM (OSMnx, cached to `data/roads.graphml`), ~200 households on real building points along SR 89A (attributes from Aarya's `data/population.csv`; random until it arrives), 8 vehicles (2 paratransit vans with wheelchair + lift, 2 agency vans, 4 neighbor cars), 2 shelters. Travel-time matrix with Dijkstra. `POST /sim/control` toggles stand-ins | Seeding draws 200 homes + 8 vehicles on the map |
| **D2-03** | 2:30–4:30 | **Console v1.** Homes, vehicles, zone, requests list, counters, all live from `/live` | A record change from Deep shows on the map within 1 s |
| **D2-04** | 4:30–6:00 | **Greedy dispatcher + solve loop** (`api/dispatch/greedy.py`): earliest deadline first, capacity + crew + lift compatible, insert only after a vehicle's accepted stops, nearest shelter with room. Loop: every 5 s while requests are open, and immediately on a closure. Writes `proposed` assignments + `plans` (version, solveMs). Approve button + `A` key → `POST /assignments/{id}/approve`. "Auto-approve" stand-in switch | **M1 (6 PM)** with Deep: request → proposed offer on the map → approve |
| **D2-05** | 6:00–8:30 | **Driver app.** Pick a vehicle (`?v=vh_luis`), offer card + countdown, Accept → `{result}` (`changed` → "Assignment changed" card), run list, live GPS from the phone (`watchPosition` → `/vehicles/{id}/position`), "Picked up" → `arrived`. **Stand-in drivers:** simulated vehicles accept after 6 s and drive their routes (position updates every 1 s along the path) | A real phone accepts. Rosa's callback fires (Deep) |
| **D2-06** | 8:30–10:00 | **Road closures + revoke.** Console tool: draw a line → `POST /roads/closures` → remove graph edges → re-plan. If no route reaches an *accepted* pickup before its deadline → `cancel/revoke` → request `reassigning` → new offer to another vehicle. The rest of that driver's run stays as it was | **M2 (10 PM):** close SR 89A → revoke → resident told → new driver accepts. A stale accept shows "changed" |
| **D2-07** | 10:00–11:30 | **Fire map + deadlines** (`api/hazard/`). `firms.py`: NASA FIRMS area API (VIIRS NRT) for the bbox. For the demo, replay `data/scenario.json` (Aarya's Pocket Fire timeline) on a fast clock. `spread.py`: elliptical spread from ignition points with wind speed/direction → `fireArrivalAt` per home → `deadlineAt = arrival − 10 min`. When the front comes within 100 m of a road segment, add a `hazard` closure automatically (same path as D2-06). Write detections + vehicle tracks to **Tiger Data**. Fire layer on console + driver | Fire front grows on the map. Deadlines tick down in the list. The fire reaching SR 89A closes it by itself |
| **D2-08** | 11:30–12:45 | **Driver safety.** `web/app/driver/safety.ts`: DeviceMotion impact > 2.5 g, then stillness → "Are you OK?" 20 s → `POST /vehicles/{id}/safety {state: man_down}`. Hold 2 s → SOS. Fire distance + trend banner. Warn if the route passes within 300 m of the fire front. Console: red safety toast + flying to the vehicle | Dropping the phone on a couch → MAN DOWN on the console with coordinates |
| — | **1:00 AM** | **Feature freeze (M3).** Cut `v0.3` to staging with Deep | |
| **D2-09** | 1:00–3:00 | **Impact simulation** (`api/sim/compare.py`, analysis, not product). Same households, fire, fleet, 50 seeds: **today** (≈55% of riders call 911 ~20 min before fire, first come first served, nearest unit, one household per trip) vs **Way Out greedy** vs **OR-Tools** (P1: pickup-and-delivery with time windows + capacity dims, 3 s limit). Output median + 5th–95th percentile of "boarded ≥ 10 min before fire" → `data/sim-results.json` + chart for Aarya. Assumptions agreed with Aarya and written in the file | Aarya has the headline number with a range |
| **D2-10** | **~5:15 PM, 15 min** (after Aarya's A-13) | **Go live** (from Prem's P-04). `infra/README.md` → Go-live checklist, steps 5–9 marked **Yash**: repo secrets `VULTR_HOST`, `VULTR_USER`, `VULTR_SSH_KEY` → Actions → **deploy** → Run for `dev`, `staging`, `prod`. Vercel: import repo, root `web`, `NEXT_PUBLIC_API_URL` per branch, domains `dev.` / `staging.` / `app.`. Run `scripts/smoke.py --domain <d>`. **`v0.0`**: PR `develop → staging` (merge), PR `staging → main` (Prem approves and merges from his phone), then `git tag v0.0 origin/main && git push origin v0.0` | `curl https://api-dev.<domain>/health` shows `env: dev` and the sha. Smoke is green on all three. Tag `v0.0` exists |
| D2-10 | 3:00–5:00 | Fix what Prem's end-to-end run finds. Polish the console (spacing, motion, empty states) | |

## Claude Code starter prompt (D2-01 + D2-03)
```
Read README.md, AGENTS.md, docs/CONTRACT.md and docs/team/yash.md. On feat/D2-01-web-scaffold create a
Next.js App Router app in web/ with Tailwind, shadcn/ui, MapLibre GL (dark basemap) and deck.gl. Build
lib/live.ts: a WebSocket client to NEXT_PUBLIC_API_URL/live with reconnect, feeding a Zustand store per
collection (households, requests, assignments, vehicles, hazards, zones). Then on feat/D2-03-console
build /console: full-bleed map with deck.gl layers (homes colored by role with a pulse on change,
vehicles as TripsLayer with trails, zone outline, fire polygon), a top bar with animated counters and
the zone status chip, a collapsible left drawer of open requests sorted by deadline (shrinking time bar),
and a right drawer for the proposed plan with Approve buttons and keyboard shortcut A. Dark, calm,
uncluttered; red only for fire and people who need help; SIM badge on simulated items.
```
