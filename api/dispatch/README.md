# api/dispatch/ — solver

| File | What |
|---|---|
| `greedy.py` | Earliest-deadline-first, capacity/crew/lift compatible, insert after last accepted stop |
| `loop.py` | Re-plan every 5 s while open, 30 s otherwise, immediately on closure. Started from `api/workers.py` |

Planned, not built: an OR-Tools pickup-and-delivery VRP (time windows, 3 s limit, warm start from greedy) and a
door-knock priority score. `POST /plans/solve` accepts `solver: ortools` but runs greedy until then.

Write `plans` + `proposed` assignments only. Approve/accept/revoke go through `api/assignments.py`.
Accepted stops are frozen; to drop one that can no longer be reached, call `api.assignments.revoke()`.
