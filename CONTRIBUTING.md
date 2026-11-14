# Contributing: branches, environments, releases

We work like a small production team. Every change can be traced from a task to a PR to a deploy.

## Branches

| Branch | Deploys to | Who merges | Protection |
|---|---|---|---|
| `main` | **Production** (`app.<domain>`, `api.<domain>`) | **Prem only** (`v0.0` at 2 PM, `v1.0` at ~4:30 AM, then approved fixes) | PR only, CI green, 1 approval |
| `staging` | **Testing** (`staging.<domain>`, `api-staging.<domain>`) | Whoever cuts the release | PR only, CI green |
| `develop` | **Development** (`dev.<domain>`, `api-dev.<domain>`) | Anyone, after review | PR only, CI green |
| `feat/<id>-<slug>` | Vercel preview URL per PR | — | — |
| `fix/<id>-<slug>` | Vercel preview URL per PR | — | — |

Flow: `feat/*` → PR → `develop` → (release PR) → `staging` → (release PR) → `main`.

## Tasks and IDs

- Every task in `docs/team/*.md` has an ID: `P-` (Prem), `D1-` (Deep), `D2-` (Yash), `A-` (Aarya).
- Create a GitHub Issue per P0/P1 task with the same ID in the title, e.g. `D1-03 Honesty guard + status templates`.
- Branch name: `feat/D1-03-honesty-guard`. PR title: `D1-03: honesty guard + status templates`. The PR body says `Closes #<issue>`.

## Commits

Conventional commits, small and frequent:
`feat(agent): status templates for reassigning` · `fix(dispatch): frozen accepted runs` · `docs(contract): add vehicle.safety event` · `test(requests): illegal transition raises`

Coding agents must prefix the task ID in the PR title. Agents should commit; humans open and merge PRs.

## Pull requests

PR template (`.github/pull_request_template.md`):
```
## What
## Task
Closes #
## Contract change?  [ ] no  [ ] yes → updated docs/CONTRACT.md and tagged @team
## How I tested
- [ ] unit tests pass   - [ ] tried on Vercel preview   - [ ] screenshot / clip attached
```
- Merge with **squash**. Delete the branch after merging.
- Rebase on `develop` before merging if CI is stale.

## CI/CD (`.github/workflows/`)

- `ci.yml` (every PR): `api`: ruff + pytest. `web`: eslint + typecheck + build.
- `deploy.yml` (push to `develop` / `staging` / `main`): build the API Docker image → SSH to the Vultr VM → `docker compose up -d api-<env>`. Vercel deploys the web app by branch.
- `GET /health` returns `{env, version, gitSha}`, so you always know what's running where.

## Environments

| | Development | Testing (staging) | Production |
|---|---|---|---|
| Atlas DB | `wayout_dev` | `wayout_staging` | `wayout_prod` |
| Stand-ins | on | on | on for the demo, labeled "simulated" |
| Real phone calls | team phones only | team phones only | judges' phones |
| Secrets | GitHub Environment `dev` | `staging` | `production` |

## Releases

| Tag | When | Contains | Goes to |
|---|---|---|---|
| `v0.0` | ~5:30 PM (moved) | foundation: skeleton, core rules, 3 envs | `staging` + `main` (Yash opens the PRs, Prem merges `main` from mobile; see D2-10) |
| `v0.1` | M1, 6 PM | call → record → request on map | `staging` |
| `v0.2` | M2, 10 PM | approve → accept → callback → closure → reassign | `staging` |
| `v0.3` | M3, 1 AM | fire map, SOS, dedupe, /system | `staging` |
| `v1.0` | ~4:30 AM | demo build, frozen | `staging` → `main` (Prem) |

Deep and Yash cut `v0.1`–`v0.3` together (`develop → staging` PR, one approves the other's). Only Prem merges into `main`.

After `v1.0`, only `fix/*` PRs, each approved by Prem.

**Hard stop (MLH rule from the opening slides): no commits to any branch after hacking ends at 11:00 AM Sunday.** Code freeze at 10:30 AM. At the expo, fix problems by restarting or re-seeding, never by pushing.

## Secrets

Never commit keys. Use `.env` locally (git-ignored), GitHub Environments in CI, and `/opt/wayout/<env>.env` on Vultr. If a key is ever pasted in chat or committed, rotate it.
