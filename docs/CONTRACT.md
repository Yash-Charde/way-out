# Way Out — Contract (shared)

Everyone builds against this file. **Changing a field, an endpoint, or an event name?** Open a PR that edits this file first, label it `contract`, and tag the others. Keep old fields working until nothing reads them.

Prem writes v1 by **2:00 PM Saturday**. After that, Deep and Yash co-own it.

---

## 1. MongoDB collections

DB name = `wayout_${ENV}` (`dev`, `staging`, `prod`). All geometry is GeoJSON. Index `location` with `2dsphere`.

### `households`
```jsonc
{
  "_id": "hh_...",
  "address": "1225 N SR 89A, Sedona, AZ",
  "location": { "type": "Point", "coordinates": [-111.73, 34.93] },
  "zoneId": "zone_oak_creek_14",
  "phone": "+1...",               // E.164; stand-ins use fake numbers
  "language": "en",               // en | es
  "simulated": true,              // stand-in vs real demo phone
  "personaId": "p01",             // simulated homes only: data/personas.json script + truth (added D2-02)
  "record": {                     // written ONLY by the agent (PATCH /households/{id}/record)
    "canLeave": "yes|no|unsure",
    "peopleCount": 2,
    "mobility": "walks|walker|manual_wheelchair|power_wheelchair|bedbound",
    "assistance": "none|one_person|two_person_lift",
    "medical": ["oxygen"],        // oxygen | dialysis | other
    "pets": true,
    "hasCar": false,
    "confidence": { "mobility": 0.9 }
  },
  "corrections": [ { "field": "peopleCount", "from": 1, "to": 2, "at": "..." } ],
  "reach": "not_called|ringing|in_call|answered|retry_2|retry_5|texted|door_check|unreachable",
  "dialAttempts": 2, "lastDialAt": "ISO", "nextAttemptAt": "ISO",   // dialer + reach ladder (added D1-05)
  "role": "unknown|needs_ride|can_help|left|stay",   // drives map color
  "fireArrivalAt": "ISO",         // hazard service
  "deadlineAt": "ISO",            // fireArrivalAt - 10 min
  "doorPriority": 0.0,
  "updatedAt": "ISO"
}
```

### `requests` (a ride request; status changes ONLY through `api/requests.py`)
```jsonc
{
  "_id": "rq_...", "householdId": "hh_...",
  "status": "received|approved|driver_accepted|en_route|arrived|closed|reassigning",
  "need": { "seats": 2, "wheelchair": 1, "stretcher": 0, "crew": 2, "lift": true },
  "deadlineAt": "ISO", "priority": 0.0,
  "escalation": null,            // medical | flames | address_unconfirmed | unservable | language
  "dupOf": null,                 // set by dedupe
  "version": 3, "createdAt": "ISO", "updatedAt": "ISO"
}
```

**Legal transitions** (anything else raises an error):
```
received ──approve──► approved ──driver accepts──► driver_accepted ──► en_route ──► arrived ──► closed
   ▲                     │                                │
   └ decline / expire / ─┘                 no route in time / driver cancels
     replaced (silent: rider never heard)                 ▼
                                             reassigning ──new accept──► driver_accepted
```
- Also legal: `driver_accepted → arrived` (driver reaches the door without an `en_route` report).
- **Any open status → `closed`** when no ride is needed any more (resident left on their own, duplicate, dispatcher). Only `POST /requests/{id}/close` takes this exit: it replaces live offers silently and revokes an accepted pickup (the rest of that driver's run stays). The resident is not called. *Added after v0.0 (handoff question 2).*
- Approval **never** triggers a callback. Only `driver_accepted`, `reassigning`, `en_route` (first report, then each ETA change > 3 min), and `arrived` do.
- Ride progress after accept goes through `POST /assignments/{id}/progress`: `en_route` (+`etaMinutes`, repeat to update) → `arrived` ("Picked up") → `completed` (dropped at shelter: request `closed`, assignment `completed`, no callback).

### `vehicles`
```jsonc
{
  "_id": "vh_...", "kind": "agency_van|paratransit|neighbor",
  "driverName": "Luis", "phone": "+1...",
  "capacity": { "seats": 4, "wheelchair": 1, "stretcher": 0 }, "crew": 2, "lift": true,
  "location": { "type": "Point", "coordinates": [...] }, "heading": 120, "speedMps": 12,
  "status": "idle|offered|on_run|offline",
  "safety": { "state": "ok|check|man_down|sos", "at": "ISO", "location": {...} },
  "simulated": true, "lastSeenAt": "ISO",
  "phoneSeenAt": "ISO"            // driver app open on a phone; stand-in drivers skip it (added D2-05)
}
```

### `assignments` (offers)
```jsonc
{
  "_id": "as_...", "requestId": "rq_...", "vehicleId": "vh_...",
  "planVersion": 12, "stopOrder": 2, "etaMinutes": 7.4,
  "status": "proposed|offered|accepted|declined|expired|replaced|revoked|completed",
  "offeredAt": "ISO", "expiresAt": "ISO", "respondedAt": "ISO",
  "announcedEtaMinutes": 7.0,    // last ETA the resident was told (en_route)
  "announcedEtaSeq": 1,          // en_route announcements so far
  "completedAt": "ISO",
  "late": false                  // solver: no vehicle makes the deadline; still offered (added D2-04)
}
```
- **Atomic accept:** `find_one_and_update({_id, status: "offered"}, {$set: {status: "accepted", ...}})`. If it returns `None`, respond `{"result": "changed"}`. Offers expire 2 min after `offeredAt`.
- **Accepted runs are frozen.** New offers only go after a vehicle's last accepted stop.

### `callbacks`
`{ _id, requestId, assignmentId, announcedStatus, etaMinutes, state: queued|placed|played|unanswered|skipped, key }`. Worker fields (added D1-06): `attempts`, `notBefore`, `callId`, `placedAt`, `playedAt`, `via: in_call` (heard on a call already in progress), `reason` (why it was `skipped`: the request moved on, the offer is no longer accepted, or a newer ETA is queued). The call doc of a callback has `direction: callback` and `callbackId`. `key = requestId:assignmentId:announcedStatus` has a **unique index**, so callbacks are idempotent. For `en_route` only, the key ends with the announcement number (`...:en_route:<announcedEtaSeq>`) so each ETA change > 3 min gets its own callback. A counter, not the ETA minute: an ETA going 10 → 14 → 10 would collide with its own first key. `etaMinutes` is the ETA that triggered it; the worker reads the live ETA from the assignment when it dials. *Added after v0.0 (handoff question 1).*

### `calls`
`{ _id, householdId, direction: outbound|inbound|callback, cartesiaCallId, startedAt, endedAt, outcome: answered|no_answer|voicemail|failed, language, turns: [{speaker: agent|resident, text, at, latencyMs, requestStatus, guardBlocked}] }`

### `hazards`
`{ _id, kind: fire|flood|road_blocked, source: firms|spread|photo|manual|sim, geometry, detectedAt, confidence, photoUrl? }`

### `zones`
`{ _id, name, county, status: ready|set|go|clear, polygon, source: tinyfish|manual, sourceUrl, updatedAt }`. Added D1-07: `drill: {published, publishedAt}` (what the drill page shows; changes nothing by itself) and `watch: {armedUntil, lastCheckAt, lastSeen, lastError, lastChangeAt, checks}` (TinyFish watcher). Collection `tinyfishUsage` `{_id: "YYYY-MM-DD", fetches}` counts free Fetch calls against the daily cap.

### Also
`shelters` (location, capacity), `roadClosures` (LineString, source, at), `auditLog` (kind, message, refs, at), `plans` (version, solver, solveMs, objective, changedOffers; D2-04 adds proposals, unservable, unreachableCommitted, requested), `simControl` (one doc `_id: "sim"`, `standIns: {voice, drivers, approval}`; added D2-02).

### Tiger Data (Postgres / Timescale hypertables)
`vehicle_positions(time, vehicle_id, lon, lat, speed)` · `fire_detections(time, lon, lat, frp, source)` · `call_turns(time, call_id, latency_ms, guard_blocked)` · `kpis(time, name, value)`

---

## 2. HTTP API (FastAPI, prefix none, JSON)

Auth: dashboard and driver endpoints are open in demo mode. `/agent/*` and webhooks require `Authorization: Bearer $INTERNAL_TOKEN`.

| Method | Path | Body → Response | Owner |
|---|---|---|---|
| POST | `/agent/start` | `{householdId, callType: outbound\|callback\|inbound, callId}` → `{say: [str], stage}` | Deep |
| POST | `/agent/turn` | `{callId, householdId, text, language}` → `{say: [str], stage, done, record, requestStatus}` | Deep |
| POST | `/calls/kiosk` | `{householdId, phone: +1XXXXXXXXXX}` → `{callId, householdId, address}`: the house becomes the judge's real phone, then is dialed. 429 above 6/min (added D1-08) | Deep |
| POST | `/calls/dial` | `{householdId}` → `{callId}` (real call via Cartesia, or stand-in) | Deep |
| GET | `/calls?limit=` | → `[call summary + household]`, most recently active first (added D1-04) | Deep |
| GET | `/calls/{id}` | → call summary + `turns` + open `request` (added D1-04) | Deep |
| PATCH | `/households/{id}/record` | partial record → household | Deep |
| GET | `/households?zoneId=` | → `[household]` | Prem |
| GET | `/requests/open` | → `[request + household]` sorted by deadline | Prem |
| POST | `/requests/{id}/escalate` | `{reason}` | Prem |
| POST | `/requests/{id}/close` | `{reason: resident_left\|duplicate\|dispatcher}` → request (closed). No callback | Prem (core) |
| POST | `/plans/solve` | `{solver: greedy\|ortools}` → plan | Yash |
| GET | `/plans/latest` | → newest plan + every live `proposed`/`offered` assignment (any version), by ETA | Yash |
| POST | `/assignments/{id}/approve` | → assignment | Prem (core) |
| POST | `/assignments/{id}/accept` | → `{result: accepted\|changed}` | Prem (core) |
| POST | `/assignments/{id}/decline` | → assignment | Prem (core) |
| POST | `/assignments/{id}/cancel` | driver can't make it → revoke | Prem (core) |
| POST | `/assignments/{id}/progress` | `{status: en_route\|arrived\|completed, etaMinutes?}` → assignment. Driver app + stand-in drivers | Prem (core) |
| POST | `/vehicles/{id}/position` | `{lon, lat, heading, speedMps}` | Yash |
| POST | `/vehicles/{id}/safety` | `{state, lon, lat}` | Yash |
| GET | `/vehicles` | → `[vehicle]` | Yash |
| GET | `/vehicles/{id}/run` | → `{vehicle, offers[], run[], shelters[], now}`; each offer/stop = assignment + `request {id,status,need,deadlineAt,escalation}` + `household {id,address,location,language}` *(added D2-05)* | Yash |
| POST | `/vehicles/{id}/presence` | driver app open (every ~20 s) → `{ok}`; stand-in drivers leave the vehicle alone for 2 min *(added D2-05)* | Yash |
| POST | `/roads/closures` | `{geometry, source}` → triggers re-plan | Yash |
| GET | `/hazards` | → `{hazards, closures, shelters, zones}`: fire front, detections, road closures, shelters, zone outlines (what the console map draws; shelters + zones added D2-03) | Yash |
| POST | `/hazards/photo` | multipart image + lon/lat → Gemini vision → hazard | Yash (P2) |
| GET | `/zones` | → `[zone]` (added D1-07) | Deep |
| GET | `/zones/{id}/drill` | → drill page view: published status, zone status, watcher, free-tier usage (added D1-07) | Deep |
| POST | `/zones/{id}/drill` | `{published}` → drill view. Only changes the page; TinyFish must read it (added D1-07) | Deep |
| POST | `/zones/{id}/drill/watch` | `{on}` → arm/disarm the TinyFish watcher (added D1-07) | Deep |
| POST | `/zones/county-check` | one read-only TinyFish fetch of `COUNTY_PAGE_URL`, logged (Bearer; added D1-07) | Deep |
| POST | `/zones/{id}/status` | `{status, sourceUrl}` (TinyFish webhook) → starts dialing at `set` | Deep |
| POST | `/sim/seed` | `?scenario=pocket-fire&homes=200&seed=42&census=none\|instant&firstArrivalMin=90` → replaces the simulated world: 200 homes, 8 vehicles, 2 shelters, 2 zones. Real households stay | Yash |
| POST | `/sim/census` | answer every unreached simulated home from its persona (no calls) → `{requests}` *(added D2-02)* | Yash |
| POST / GET | `/sim/control` | `{standIns?: {voice, drivers, approval}: bool, speedup?: 1–600}` (partial updates) → `{standIns, speedup}`. `drivers`: simulated vehicles accept after 6 s and drive their runs; `speedup`: they drive and board N× faster | Yash |
| GET | `/system/metrics` | → `{live: {calls, latencyMs: {realPhone, standIns}, interpreter, fallbacks, acks}, evals: data/eval-results.json \| null, dispatch: data/sim-results.json \| null, census: {reach, openRequests, duplicatesMerged}, audit: [..40]}` (shape added D1-09) | Deep |
| GET | `/health` | → `{ok, env, version, gitSha}` | Prem |

### `data/sim-results.json` (Yash, D2-09; read by `/system/metrics` and slide 7)

Made by `uv run --project api python -m api.sim.compare --seeds 50`. Everything in it is **simulated**.

```jsonc
{
  "schema": 1, "simulated": true,
  "label": "Simulated: 200 homes, Oak Creek Canyon scenario",   // print under the chart
  "metric": "Share of people who needed a ride picked up before their deadline ...",
  "generatedAt": "ISO", "gitSha": "abc1234", "seedsPerColumn": 50, "runs": 150,
  "bars": [                                                     // in chart order
    {"key": "today",  "label": "Today (911 queue)",          "available": true, "color": "orange",
     "median": 47.6, "min": 36.6, "max": 52.7,                  // median of the middle column; whisker = min..max of column medians
     "columns": {"low|middle|high": {"median", "p5", "p95", "runs"}}},
    {"key": "greedy", "label": "Way Out (greedy dispatch)",  "available": true, "color": "blue", ...},
    {"key": "ortools","label": "Way Out (OR-Tools)",         "available": false, "note": "..."}
  ],
  "headline": {"wayOutPct", "todayPct", "wayOutRange": [min, max], "todayRange": [min, max], "runsPerColumn", "text"},
  "sensitivity": {"today55": {...}, "todayWithNeighbors": {...}},
  "ridersPerRun": {...}, "settings": {...}, "fleets": {...}, "assumptions": {...}, "notClaimed": [...]
}
```

## 3. Live events (WebSocket `/live`)

Server pushes `{type, data, at}`. Source: MongoDB change streams.

| type | data |
|---|---|
| `household.updated` | household |
| `request.updated` | request |
| `assignment.updated` | assignment |
| `vehicle.moved` | `{id, lon, lat, heading}` (throttle to ≤ 2/s per vehicle) |
| `vehicle.updated` | vehicle (status, capacity, driver; anything except position/safety). *Added in v0.0 so the fleet list stays live.* |
| `vehicle.safety` | `{id, state, lon, lat}` |
| `call.turn` | `{callId, householdId, speaker, text, latencyMs, requestStatus, guardBlocked, stage, at}` (last four added D1-04) |
| `hazard.updated` | hazard |
| `plan.updated` | plan summary |
| `zone.updated` | zone |

## 4. What the agent may say, by request status (code enforces this)

| Status | Agent says (template) | Never |
|---|---|---|
| none / `received` / `approved` | "You're on the rescue list as high priority. No driver has accepted yet. I'll call you back the moment one does. If you can leave safely, leave now. If fire reaches your home, call 911." | Any promise, ETA, "don't worry" |
| none, *before we know they need a ride* (added D1-02) | "No driver is assigned to you. I need a few answers first to put you on the rescue list." (If they said they can leave: "You told me you can leave on your own, so no driver is assigned to you.") | Saying they're on the list when no request exists |
| `driver_accepted` | "A {vehicle} with {crew} is {eta} minutes away. The driver's name is {name}. I'll call again if anything changes." | An ETA the AI made up |
| `en_route` | "{name} is about {eta} minutes away." | "Stay put no matter what" |
| `reassigning` | "Your driver can no longer reach you. You're still at the top of the list. I'll call the moment a new driver accepts. If you can leave safely, leave now." | The old ETA. Silence |
| `arrived`/`closed` | "Your driver has arrived." / shelter name | Anything about other residents |

The AI writes only a short acknowledgment (≤ 6 words). `api/agent/honesty.py` drops it if it sounds like a promise while no driver has accepted, or if it contains any digits. It also always drops timing words ("soon", "minutes"), comfort ("you're safe") and advice ("stay put"), since those belong to templates.

## 5. Interpreter output (Gemini JSON schema)

```jsonc
{
  "set": ["peopleCount=2", "mobility=power_wheelchair"],   // field=value changes from THIS utterance
  "guessed": ["mobility"],
  "answer": "yes|no|unclear",
  "emergency": "medical|flames",
  "flags": ["asks_ride","goodbye","asks_repeat","wants_time","not_to_agent","asks_what_to_do","asks_why"],  // asks_why added D1-03
  "neighbors": ["the house across the street, she uses a walker"],
  "language": "es",
  "ack": "Thanks, a power chair."
}
```
- `mobility=wheelchair` is allowed in interpreter output when the kind of chair isn't said yet. It is never stored: the agent asks "manual or power?" and writes `manual_wheelchair` / `power_wheelchair` (D1-02).
- `medical=none` means "no medical needs" and is stored as `medical: []`.
