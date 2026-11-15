# Yash: progress

**Role:** Dev 2, responder side: console, driver app, dispatch, fire map, sim · **Task file:** [`docs/team/yash.md`](../yash.md) · **Your branch:** `feat/yash`

Update this table as you go (⬜ todo · 🟡 in progress · ✅ done · ⛔ blocked). Commit it with your work so the team
can see where you are on `develop` after each merge.

| ID | When | Task | Task branch | Status | PR |
|---|---|---|---|---|---|
| D2-01 | 11:10–12:30 | Web scaffold | `feat/D2-01-web-scaffold` | ✅ pages, lib/api.ts, lib/live.ts; MapLibre + deck.gl added with D2-03 (shadcn not needed so far) | #59, D2-03 PR |
| D2-02 | 12:30–2:30 | Simulated world | `feat/D2-02-D2-04-sim-dispatch` | ✅ merged: seed (real personas + scenario), instant census, stand-in switches. OSMnx graph deferred to D2-06 | #51 |
| D2-03 | 2:30–4:30 | Console v1 | `feat/D2-03-console-map` | ✅ merged: full-bleed map (homes by role, vehicles, routes, zones, shelters, closures), drawers, home details, Close-a-road tool | #60 |
| D2-04 | 4:30–6:00 | Greedy dispatcher + solve loop | `feat/D2-02-D2-04-sim-dispatch` | ✅ merged: greedy, loop, /plans/solve, auto-approve, closures re-plan | #51, #55 |
| D2-05 | 6:00–8:30 | Driver app | `feat/D2-05-driver-app` | ✅ merged: offer → accept → run → picked up → shelter, GPS, SOS hold; stand-in drivers | #59 |
| D2-06 | 8:30–10:00 | Road closures + revoke | `feat/D2-06-revoke` | 🟡 in review: closure → only the cut-off pickup is revoked (resident told) or withdrawn (offer, silent) → re-offered at once; late pickups move only if another van makes the deadline | D2-06 PR |
| D2-07 | 10:00–11:30 | Fire map + deadlines | `feat/D2-07-fire-map-deadlines` | ⬜ todo | |
| D2-08 | 11:30–12:45 | Driver safety | `feat/D2-08-driver-safety` | 🟡 SOS hold in #59; man-down (DeviceMotion), fire banner, route warning todo | |
| D2-09 | 1:00–3:00 | Impact simulation | `feat/D2-09-impact-sim` | ✅ merged early to unblock A-09: Way Out 90.9% vs today 47.6% (middle), `data/sim-results.json` | #58 |

## How to work

- `feat/yash` is your home branch, cut from `develop`. For each task you can work here, or cut a task branch
  (`feat/<ID>-<slug>`, names above) from `develop` and open a PR back into `develop`. Small PRs merge faster.
- Keep in sync: `git fetch origin && git rebase origin/develop` before you open a PR.
- Rules: [`AGENTS.md`](../../../AGENTS.md) · flow: [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) · shared shapes: [`docs/CONTRACT.md`](../../CONTRACT.md).
- Blocked more than 20 minutes → post in team chat with the task ID.

## Notes

- **7:50 PM Sat:** D2-03 merged; D2-06 (M2) in review. Seeded check: closing SR 89A north of Indian Gardens revokes 7 accepted pickups, all 7 residents told, 2 re-offered to uphill neighbors and accepted, 5 flagged unservable. Next: fire replay (D2-07), man-down (D2-08).

- **7:45 PM Sat:** D2-05 merged. Console map in review. Basemap is OpenFreeMap Dark (free, no key; CARTO now needs a key); falls back to a plain dark background offline. Next: revoke (D2-06), fire replay (D2-07), man-down (D2-08).

- **7:25 PM Sat:** D2-09 merged early (Aarya's A-09 was blocked on it). D2-05 in review (#59). Next: console map (D2-03), revoke (D2-06), fire replay (D2-07), man-down (D2-08). D2-10 waits on Deep's domain; repo secrets can go in now.

- **4:20 PM Sat:** #51 = D2-02 + D2-04 + a list console, so M1 works without the map. 479 tests green.
- Walter Ng (p04, bedbound) is always `unservable`: no stretcher vehicle in the fleet. Decide with Aarya.
- For Deep (flagged in #51, tell him in chat): persona p34 (can leave, no car) never gets a request from `flow.role_for()`.
