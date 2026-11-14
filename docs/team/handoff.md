# Handoff (P-05): foundation v0.0

## Done

| Area | Where | Notes |
|---|---|---|
| Docs | `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `docs/` | From the team pack. One contract addition: `vehicle.updated` event (§3) |
| API skeleton | `api/main.py`, `api/core/`, `api/models/` | Config by `ENV` → `wayout_<env>`, motor client, Pydantic models for every collection, indexes (`2dsphere`, unique callback `key`, unique plan `version`), `GET /health` |
| Request status machine | `api/requests.py` | `transition()` with legal moves only, compare-and-set on `(status, version)`, audit on every move and every rejected move. `upsert_for_household()` for the agent |
| Offers | `api/assignments.py`, `api/routes/assignments.py` | approve (silent) / atomic accept / decline / revoke (cancel) / 2-min expiry loop. One live offer per request. Revoke only touches that one pickup |
| Callback queue | `api/callbacks.py` | Idempotent `requestId:assignmentId:status`. Refuses silent statuses. Deep's worker consumes `state: queued` |
| Live | `api/live.py`, `web/lib/live.ts` | Change streams → `/live` `{type, data, at}`, `vehicle.moved` throttled to 2/s, client reconnect + REST resync |
| Reads/writes others can use now | `GET /households`, `GET /requests/open`, `PATCH /households/{id}/record`, `POST /zones/{id}/status`, `GET /vehicles`, `POST /vehicles/{id}/position`, `POST /vehicles/{id}/safety`, `POST /roads/closures`, `GET /hazards`, `GET /plans/latest` | |
| Stubs (501 + task ID) | `/agent/*`, `/calls/dial`, `/system/metrics`, `/plans/solve`, `/sim/*`, `/hazards/photo` | Replace the `raise not_yet(...)` |
| Web shell | `web/` | Next.js 15 + Tailwind 4 + Zustand, dark tokens, all page routes, `SimBadge`. Lint / typecheck / build pass |
| Tests | `api/tests/` | 77 tests: every legal + illegal transition, **20 concurrent accepts → exactly 1**, duplicate callback ignored, expiry, revoke keeps the rest of the run, late tap → `changed` |
| CI/CD | `.github/workflows/ci.yml`, `deploy.yml` | CI runs pytest against a real `mongo:7`. Deploy: GHCR image → SSH → `infra/deploy.sh <env> <sha>` |
| Infra | `infra/` | Compose with `api-dev/staging/prod` + Caddy auto-HTTPS; local Mongo replica set |
| GitHub setup | `scripts/github-setup.sh` | Branches, protection, environments, labels, one issue per task ID |

## Not done yet (needs accounts/keys)

- [ ] Run `scripts/github-setup.sh` (needs `gh auth login` as a repo admin)
- [ ] Vultr VM + DNS + `/opt/wayout/{.env,dev.env,staging.env,prod.env}` (see `infra/README.md`)
- [ ] GitHub Environment secrets: `VULTR_HOST`, `VULTR_USER`, `VULTR_SSH_KEY`
- [ ] Vercel project (root `web/`), branch domains, `NEXT_PUBLIC_API_URL` per env
- [ ] Atlas cluster + users; `MONGODB_URI` in each env file
- [ ] A call ringing a phone (D1-01)
- [ ] Tag `v0.0`

## URLs

| | Web | API |
|---|---|---|
| dev | `https://dev.<domain>` | `https://api-dev.<domain>/health` |
| staging | `https://staging.<domain>` | `https://api-staging.<domain>/health` |
| prod | `https://app.<domain>` | `https://api.<domain>/health` |

## Contract questions (resolved after v0.0, branch `feat/P-03-contract-followups`)

1. **`en_route` callbacks and the idempotency key.** ✅ The `en_route` key ends with an announcement counter: `requestId:assignmentId:en_route:<n>` (`announcedEtaSeq` on the assignment, moved by compare-and-set). Not the ETA minute, because 10 → 14 → 10 would collide with the first key. The 3-minute rule lives in core (`api/callbacks.py`), so callers just report ETAs.
2. **Closing a reassigning request.** ✅ Any open request can be closed through `POST /requests/{id}/close` (resident left, duplicate, dispatcher). It withdraws live offers silently and revokes an accepted pickup without calling the resident. Deep: call it when a resident says they already left (`role: left`). Dedupe can use it for `dupOf`.
3. **Python package path.** As is: the API is the package `api`, run from the repo root. Deep's CLI is `uv run --project api python -m api.agent.chat`.

## New core endpoint for the driver app (Yash, D2-05)

`POST /assignments/{id}/progress` `{status: en_route|arrived|completed, etaMinutes?}`

- `en_route` + `etaMinutes`: send when this pickup is the driver's next stop, then every few seconds with the new ETA. Core decides when the resident hears it (first report, then changes > 3 min).
- `arrived`: the "Picked up" button. The resident gets the "Your driver has arrived" callback.
- `completed`: dropped at the shelter. Request closed, vehicle goes back to idle when it has no other stops.
