# Prem: foundation, infra, coordination

**Hours:** 9:00 AM–2:00 PM Saturday (coding only from 11:10), away 2:00 PM–1:00 AM, back 1:00 AM–end.
**Mission:** by 2:00 PM, the other three never wait on setup. From 1:00 AM, turn everyone's work into one demo that works every time.

> Rule: **no code before 11:10 AM** (MLH: all work during the hacking period). Before 11:10, set up accounts and keys and read the docs. That isn't code.

---

## Before hacking (9:00–11:10 AM)

- [ ] **P-00 Accounts and keys** (share through a password manager or a private note, **never the group chat**)
  - GitHub org/repo name reserved: `wayout`
  - MongoDB Atlas: one cluster (M0 is fine), DB users, IP access `0.0.0.0/0` for the demo
  - Vultr: claim MLH credits, create a VM (Ubuntu 24.04, 2 vCPU / 4 GB), add your SSH key
  - Cartesia: **upgrade to Pro ($5)**, buy one US number → `CARTESIA_FROM_NUMBER_ID`
  - Gemini API key (AI Studio, MLH credits), Anthropic keys (each person has $25)
  - NASA FIRMS `MAP_KEY`, TinyFish key, Tiger Data service URL
  - GoDaddy Registry domain via the MLH offer (e.g. `wayout.<tld>`), DNS on Cloudflare or registrar
  - Vercel team, linked to GitHub
- [ ] Opening ceremony. Confirm the judging criteria on Devpost and post them in team chat.
- [ ] 10-minute team read-through of README + CONTRACT. Everyone agrees on the contract.

## Coding window (11:10 AM–2:00 PM)

| ID | Time | Task | Done when |
|---|---|---|---|
| **P-01** | 11:10–11:30 | Create repo `wayout`, push all docs, create `develop` + `staging` from `main`, branch protection (PR + CI required), PR template, issues for every task ID (`P-`, `D1-`, `D2-`, `A-`) | Everyone can clone, sees their issues |
| **P-02** | 11:30–12:15 | **API skeleton**: FastAPI app, `core/config.py` (ENV → DB name), Mongo client (motor), Pydantic models for every collection in CONTRACT §1, indexes (`2dsphere`, callback `key` unique), `GET /health` (env, version, gitSha), Dockerfile, `ci.yml` (ruff + pytest; web lint/build) | `pytest` green in CI, `/health` returns locally |
| **P-03** | 12:15–1:15 | **Core rules**: `api/requests.py` (`transition()` with legal moves + audit), assignments `approve/accept/decline/cancel` + 2-min expiry (background task), `callbacks` queue (idempotent key), `GET /households`, `GET /requests/open`, **`/live` WebSocket** fed by Mongo change streams. Tests: illegal transition raises, **20 concurrent accepts → exactly 1 `accepted`**, duplicate callback ignored | Tests green; Yash can call approve/accept |
| **P-04** | 1:15–1:50 | **Three environments**: Vultr: `infra/docker-compose.yml` with `api-dev`, `api-staging`, `api-prod` + Caddy (auto-HTTPS for `api-dev.`, `api-staging.`, `api.`). `deploy.yml` (push to branch → SSH → compose up). Vercel: branch domains `dev.` → `develop`, `staging.` → `staging`, `app.` → `main`. Atlas: `wayout_dev / _staging / _prod`. GitHub Environments with secrets | `curl https://api-dev.<domain>/health` shows `env: dev` and the git sha |
| **P-05** | 1:50–2:00 | **Handoff**: write `docs/team/handoff.md` (what's done, what isn't, URLs, where the keys are, any open contract questions). Tag `v0.0`. Post in team chat: "Foundation done, Yash owns core/infra fixes until 1 AM" | Team acknowledges |

**If you're running late:** do P-01 → P-02 → P-03 first. Hand P-04 (deploy) to Yash with notes. Yash can finish it at the 6 PM release.

> **Reassigned Sat 3:45 PM** (Prem is on shift, phone only until 1 AM). The account half of P-04 and the `v0.0` tag moved:
> - **Aarya → A-13**: Atlas, secrets file, Vultr VM + bootstrap, domain + DNS, deploy key.
> - **Yash → D2-10**: the 3 repo secrets and Vercel (only the repo owner can do these), first deploys, smoke test, `v0.0` PRs + tag.
> - **Prem**: approves and merges the `staging → main` PR from GitHub mobile (so only Prem still merges to `main`).
> Code for P-04 is done (#45, #46). Steps: `infra/README.md` → Go-live checklist.

### Claude Code starter prompt (P-02 + P-03)
```
Read README.md, AGENTS.md and docs/CONTRACT.md. On branch feat/P-02-api-skeleton, create the FastAPI
service in api/ exactly per CONTRACT §1–§3: config by ENV, motor client, Pydantic models, indexes,
/health, Dockerfile, pytest setup. Then on feat/P-03-core-rules implement api/requests.py transition()
with the legal transitions only, assignment approve/accept/decline/cancel with atomic accept
(find_one_and_update on status "offered"), 2-minute offer expiry, idempotent callbacks queue, and a
/live WebSocket that broadcasts Mongo change streams as {type, data, at}. Write tests first for:
illegal transitions, 20 concurrent accepts → exactly one wins, duplicate callback ignored.
```

## Away (2:00 PM–1:00 AM)

Optional, if you have your phone: glance at team chat at **6 PM (M1)** and **10 PM (M2)**. Nobody waits on you.

## Back (1:00 AM–submission)

| ID | Time | Task |
|---|---|---|
| **P-10** | 1:00–1:45 | Pull `develop`. Run the **full demo flow on staging** end to end with your own phone as Rosa. File every break as an issue labeled `demo-blocker` and assign it |
| **P-11** | 1:45–4:30 | Bug-bash lead: triage, review and merge `fix/*` PRs, keep `develop` green. Only `demo-blocker` and P1 fixes get in after 1 AM |
| **P-12** | 4:30–5:00 | **Release `v1.0`**: PR `develop → staging`, smoke test, PR `staging → main`. Production smoke test with 2 real phones. Freeze |
| **P-13** | 5:00–8:30 | Rehearse the 3-minute demo ×3 with Aarya (you or Yash plays the driver phone). Fix only what breaks the demo. Record the backup video of a clean run |
| **P-14** | 8:30–10:30 | Devpost with Aarya: links (live app, repo, video), team, "built with", AI disclosure, credits. **Submit by 10:30 (not a draft).** Hard deadline 11:00 |
| **P-15** | 12:00–2:00 PM | Expo: run the console. Check `/health` on prod before every judge visit |

## Coordination checklist
- [ ] Standups (5 min): 11:10 AM, 2:00 PM (handoff), 6:00 PM (M1, without you), 10:00 PM (M2, without you), 1:00 AM, 5:00 AM, 9:00 AM
- [ ] Blocked more than 20 minutes → post in chat with the task ID
- [ ] One person merges to `main`: you. While you're away, nobody merges to `main`
- [ ] Sleep plan: Aarya 1–3 AM, Deep 3–5 AM, Yash 5–7 AM. You stay up from 1 AM
