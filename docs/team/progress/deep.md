# Deep: progress

**Role:** resident side: voice, interpreter, honesty, calls, evals · **Task file:** [`docs/team/deep.md`](../deep.md) · **Your branch:** `feat/deep`

Update this table as you go (⬜ todo · 🟡 in progress · ✅ done · ⛔ blocked). Commit it with your work so the team
can see where you are on `develop` after each merge.

| ID | When | Task | Task branch | Status | PR |
|---|---|---|---|---|---|
| D1-01 | 11:10–12:30 | Cartesia hello-world → thin client | `feat/deep` | 🟡 agent deployed (Ready) + number +1 218 595 2687; needs the public API URL + token before a real call | |
| D1-02 | 12:30–2:30 | State machine + templates | `feat/deep` | ✅ done | |
| D1-03 | 2:30–4:00 | Interpreter + honesty | `feat/deep` | 🟡 code + tests done; needs a live Gemini/Claude key check | |
| D1-04 | 4:00–5:45 | Record → request | `feat/deep` | 🟡 backend + `/calls` page done; M1 check (real call → map) waits on D1-01 | |
| D1-05 | 6:00–8:00 | Dialer + reach ladder | `feat/deep` | ✅ stand-ins + ladder done (200 homes in ~2 min); real-phone dialing coded, untested until D1-01 | |
| D1-06 | 8:00–10:00 | Callbacks + live status | `feat/deep` | ✅ done with stand-ins; real-phone callbacks coded, untested until D1-01 | |
| D1-07 | 10:00–11:15 | TinyFish SET trigger | `feat/deep` | 🟡 built + tested with a fake TinyFish; live check needs a public `/drill` URL | |
| D1-08 | 11:15–12:15 | Dedupe + kiosk | `feat/deep` | 🟡 built; Gemini embeddings unused until a key is set; kiosk call waits on Cartesia | |
| D1-09 | 12:15–1:00 | Evals + /system | `feat/deep` | 🟡 evals + /system built with real numbers (rule interpreter); re-run with Gemini; Claude judge not run (cost) | |

## How to work

- `feat/deep` is your home branch, cut from `develop`. For each task you can work here, or cut a task branch
  (`feat/<ID>-<slug>`, names above) from `develop` and open a PR back into `develop`. Small PRs merge faster.
- Keep in sync: `git fetch origin && git rebase origin/develop` before you open a PR.
- Rules: [`AGENTS.md`](../../../AGENTS.md) · flow: [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) · shared shapes: [`docs/CONTRACT.md`](../../CONTRACT.md).
- Blocked more than 20 minutes → post in team chat with the task ID.

## Notes

- Try it: `uv run --project api python -m api.agent.chat -v` (no DB or keys needed).
- Contract additions (in `docs/CONTRACT.md`): a §4 line for "no request yet", the `asks_why` flag, and
  `mobility=wheelchair` / `medical=none` in interpreter output.
- Honesty guard also blocks timing words, comfort and advice at every status, not only before accept.
- A household that can leave with a car gets `role: left` (green). Tell Yash if the console wants a different role.
- Dialer (D1-05): runs inside the API. Zone at `set`/`go` → homes called earliest deadline first.
  Simulated homes are called only while `POST /sim/control {"standIns": {"voice": true}}` is on.
  Real phones need `CARTESIA_API_KEY`, `CARTESIA_AGENT_ID`, `CARTESIA_FROM_NUMBER_ID`; the Line agent gets
  `householdId` + `callId` as dynamic variables. Demo knob: `REACH_LADDER_SCALE=0.1` shortens the 2/5/3-minute waits.
- Any home without a car now gets a request (Aarya's personas expect it), not only no car + mobility limits.
- Callbacks (D1-06): `api/agent/callbacks.py` runs inside the API. Status read when the call connects, never from
  the queue, so a stale callback can't announce an old ETA. Resident already on a call → told there, no second call.
  No answer → one retry after 60 s → `unanswered`. The Line agent must pass `callType: callback` to `/agent/start`.
- TinyFish (D1-07): **free tier only.** Uses TinyFish Fetch (free up to 1,000 URLs/day), not the paid Agent.
  The watcher runs only while armed on `/drill`, reads the page every 15 s, disarms after 30 min, and stops for the
  day at 800 fetches (counted in `tinyfishUsage`). A `402` from TinyFish also stops it. Publishing a status on
  `/drill` changes nothing until TinyFish reads it. Needs `PUBLIC_WEB_URL` set to the deployed web app.
- County check (for the pitch, 2026-11-15 00:20 UTC): TinyFish Fetch read the live Coconino County page
  https://coconino.az.gov/eminfo ("Emergency Management Information", ~4,900 chars). It showed Stage 1 fire
  restrictions and no zone at SET or GO, so the watcher correctly saw no status. Free Search also finds the county's
  Ready-Set-Go and Evacuation Zones pages (coconino.az.gov/3129, /3124). Read-only: nothing was changed.
- Dedupe (D1-08): homes within 50 m with the same address (normalized) → the newer request gets `dupOf`, needs are
  merged into the older one. With `GEMINI_API_KEY`, Gemini embeddings (cosine > 0.9) also catch differently worded
  addresses. Atlas `$vectorSearch` is a TODO for when the cluster is up. A duplicate caller gets no callbacks yet.
- Kiosk (D1-08): `/` shows the homes; `POST /calls/kiosk {householdId, phone}` makes that house the judge's real
  phone (record reset, stand-in request closed) and dials it. 6 claims/min max; no phone numbers in the audit log.
  Privacy: `GET /households` (Prem's route) returns phone numbers, so a judge's number is visible there. Flag for Prem.
- Evals (D1-09), first run, rule interpreter, no AI model (2026-11-15): 40 personas, all calls completed.
  Honesty 620/620 agent turns (persona's own words) and 388/388 (direct answers). Field accuracy: 100% on direct
  answers, 27% on the personas' own unprompted words (the rule parser can't handle free speech; this is the number
  Gemini should raise). Corrections caught 2/2 (direct answers), 0/2 (own words). Latency p50 0.3 ms is code only,
  no model, so it is **not** a voice-latency number for Devpost. Real latency needs Gemini + a real call.
- Known gap: personas p29 ("I'm staying") and p31 (suspicious caller) end as `left`, not `stay`/`unknown`.
