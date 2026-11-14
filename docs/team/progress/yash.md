# Yash: progress

**Role:** Dev 2, responder side: console, driver app, dispatch, fire map, sim · **Task file:** [`docs/team/yash.md`](../yash.md) · **Your branch:** `feat/yash`

Update this table as you go (⬜ todo · 🟡 in progress · ✅ done · ⛔ blocked). Commit it with your work so the team
can see where you are on `develop` after each merge.

| ID | When | Task | Task branch | Status | PR |
|---|---|---|---|---|---|
| D2-01 | 11:10–12:30 | Web scaffold | `feat/D2-01-web-scaffold` | 🟡 shell done in v0.0 (pages, lib/api.ts, lib/live.ts); add shadcn, MapLibre, deck.gl | |
| D2-02 | 12:30–2:30 | Simulated world | `feat/D2-02-D2-04-sim-dispatch` | 🟡 in review: seed, instant census, stand-in switches. OSMnx graph deferred to D2-06 | #51 |
| D2-03 | 2:30–4:30 | Console v1 | `feat/D2-03-console-v1` | 🟡 list console in #51 (requests, plan + Approve, fleet, counters); map still todo | |
| D2-04 | 4:30–6:00 | Greedy dispatcher + solve loop | `feat/D2-02-D2-04-sim-dispatch` | 🟡 in review: greedy, loop, /plans/solve, auto-approve, closures re-plan | #51 |
| D2-05 | 6:00–8:30 | Driver app | `feat/D2-05-driver-app` | ⬜ todo | |
| D2-06 | 8:30–10:00 | Road closures + revoke | `feat/D2-06-road-closures-revoke` | ⬜ todo | |
| D2-07 | 10:00–11:30 | Fire map + deadlines | `feat/D2-07-fire-map-deadlines` | ⬜ todo | |
| D2-08 | 11:30–12:45 | Driver safety | `feat/D2-08-driver-safety` | ⬜ todo | |
| D2-09 | 1:00–3:00 | Impact simulation | `feat/D2-09-impact-simulation` | ⬜ todo | |

## How to work

- `feat/yash` is your home branch, cut from `develop`. For each task you can work here, or cut a task branch
  (`feat/<ID>-<slug>`, names above) from `develop` and open a PR back into `develop`. Small PRs merge faster.
- Keep in sync: `git fetch origin && git rebase origin/develop` before you open a PR.
- Rules: [`AGENTS.md`](../../../AGENTS.md) · flow: [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) · shared shapes: [`docs/CONTRACT.md`](../../CONTRACT.md).
- Blocked more than 20 minutes → post in team chat with the task ID.

## Notes

- **4:20 PM Sat:** #51 = D2-02 + D2-04 + a list console, so M1 works without the map. 479 tests green.
- Walter Ng (p04, bedbound) is always `unservable`: no stretcher vehicle in the fleet. Decide with Aarya.
- For Deep (flagged in #51, tell him in chat): persona p34 (can leave, no car) never gets a request from `flow.role_for()`.
