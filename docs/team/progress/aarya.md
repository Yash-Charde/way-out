# Aarya: progress

**Role:** story, data, deck, Devpost · **Task file:** [`docs/team/aarya.md`](../aarya.md) · **Your branch:** `feat/aarya`

Update this table as you go (⬜ todo · 🟡 in progress · ✅ done · ⛔ blocked). Commit it with your work so the team
can see where you are on `develop` after each merge.

| ID | When | Task | Branch | Status | PR |
|---|---|---|---|---|---|
| A-01 | 9:00–11:10 | The story | `feat/aarya` | ✅ done | #43 · `docs/story/story.md`, `sources.md` (22 facts) |
| A-02 | 11:10–1:00 | Arizona scenario facts: Pocket Fire | `feat/aarya` | ✅ done | `data/scenario.json` |
| A-03 | 1:00–2:00 | Population numbers | `feat/aarya` | ✅ done | `docs/story/population.md` |
| A-04 | 2:00–5:00 | Talk to real responders | `feat/aarya` | ✅ done (published quotes) | no interview; sourced quotes + gap in `responders.md` |
| A-05 | 5:00–6:30 | Personas | `feat/aarya` | ✅ done | `data/personas.json` (40) |
| A-06 | 6:30–10:00 | Deck v1 | `feat/aarya` | ✅ done (v1) | deck link in `docs/story/README.md`; slide 7 numbers wait for A-09 |
| A-07 | 10:00–12:00 | Demo script + Q&A | `feat/aarya` | ✅ done | `docs/story/demo.md` |
| A-08 | 12:00–1:00 AM | Devpost draft | `feat/aarya` | ✅ drafted | #43 · `docs/story/devpost.md` (+ Future of Work, prize opt-ins); save on Devpost, don't submit |
| A-09 | 3:00–5:00 | Impact numbers | `feat/aarya` | 🟡 sim + honesty in | 91% vs 48% (X-01) and 620/620 honesty, checked by code (E-01) in Devpost + slide 7; latency waits on Deep's real test call |
| A-10 | 5:00–8:30 | Rehearse ×3 | `feat/aarya` | 🟡 prep done | shot list + rehearsal log in `docs/story/expo.md` |
| A-11 | by 10:00 AM | Final deck, final Devpost with Prem: links (live app, repo, video),… | `feat/aarya` | ⬜ todo | |
| A-12 | 12:00–2:00 PM | Expo: you tell the story (first 20 seconds) and handle Q&A | `feat/aarya` | 🟡 prep done | expo cheat sheet in `docs/story/expo.md` |
| A-13 | 3:45–5:15 PM | Go-live accounts (from P-04): Atlas, secrets.env, Vultr VM, domain + DNS, deploy key | `feat/aarya` | ✅ done (temp domain) | #49 · VM `wayout` 45.77.121.104 bootstrapped with `45-77-121-104.sslip.io` (from Deep; GoDaddy domain later for the prize); Atlas `wayout` tested; CI deploy key works. Yash: repo secrets + first deploy (D2-10) |

## How to work

- All of Aarya's work goes on one branch, `feat/aarya`, cut from `develop`, with PRs back into `develop`. No per-task branches.
- Keep in sync: `git fetch origin && git merge origin/develop` before you open a PR (no rebase, no force-push).
- Rules: [`AGENTS.md`](../../../AGENTS.md) · flow: [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) · shared shapes: [`docs/CONTRACT.md`](../../CONTRACT.md).
- Blocked more than 20 minutes → post in team chat with the task ID.

## Notes

- 2026-11-14: A-01/02/03/05/07 committed on `feat/aarya-story` (since merged and deleted; one branch now). Posted to Yash: scenario.json + population rates.
- Heads-up for the team: in the real Pocket Fire the canyon went **straight to GO** (no SET stage). Demo shows a SET window; `demo.md` has the honest line for Q&A.
- `scenario.json` uses an event type `set` for the Flagstaff-side zones and adds `closure.action` (`close` / `residents_only` / `reopen`); Yash, shout if the seeder needs different names.
- Ignition point is approximate (no official coordinates published).
- A-04: no in-person interview. Responder voices are published, cited quotes (`responders.md`), labeled as such on slides and Devpost.
- 5:53 PM: #43 merged into `develop` (A-01–A-08). Added the Future of Work paragraph and prize opt-ins to `devpost.md`; Devpost now due **10:00 AM**, Aarya is the only editor.
- 6:25 PM: Vultr VM `wayout` running at 45.77.121.104 on MLH credit ($20/mo). Docker + firewall installed. CI deploy key (`wayout-ci-deploy`) is on the VM; private half goes to Yash privately. Domain is Deep's (GoDaddy). `bootstrap-vm.sh` runs once the domain and `MONGODB_URI` exist.
- 6:50 PM: Atlas ready: new org "Way Out SunHacks" (Aarya's old org didn't allow new projects), project `way-out`, free M0 `wayout` in us-west-2, network 0.0.0.0/0. Ping + write to `wayout_dev` from the VM passed. `MONGODB_URI` is in Aarya's local secrets.env (never committed). Only the domain is left before `bootstrap-vm.sh`.
- 7:16 PM: `bootstrap-vm.sh` ran on the VM with the temporary domain `45-77-121-104.sslip.io` (Deep). `/opt/wayout` has `.env` + dev/staging/prod.env (mode 600). API URLs: `https://api-dev.45-77-121-104.sslip.io`, `api-staging.`, `api.`. Still missing keys: Gemini, Anthropic, FIRMS, Tiger Data, AWS/Bedrock. When the GoDaddy domain exists: re-run bootstrap with it (or edit `/opt/wayout/.env` + `PUBLIC_API_URL` in each env file).
- 7:29 PM: D2-09 landed (#58). Fixed the comparison: Way Out (greedy) 91% vs **today's 911 queue** 48%, not "vs greedy". Baseline is generous to today (everyone calls 911; agency vehicles only); 55%-call and with-neighbors variants are X-02 / X-03. OR-Tools is not built, so Devpost marks it "only if shipped".
- 8:33 PM: App is up on dev: web https://way-out-git-develop-yash-chardes-projects.vercel.app (console loads, talks to api-dev), API https://api-dev.45-77-121-104.sslip.io. Set `PUBLIC_WEB_URL` in the VM's dev.env. No paid models on the VM (no Anthropic or Gemini key, `ALLOW_PAID_MODELS` unset). CI deploy key replaced (old one removed from the VM); Yash must update `VULTR_SSH_KEY` or deploys fail. Staging/prod not deployed yet.
