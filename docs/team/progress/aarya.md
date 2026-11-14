# Aarya: progress

**Role:** story, data, deck, Devpost · **Task file:** [`docs/team/aarya.md`](../aarya.md) · **Your branch:** `feat/aarya`

Update this table as you go (⬜ todo · 🟡 in progress · ✅ done · ⛔ blocked). Commit it with your work so the team
can see where you are on `develop` after each merge.

| ID | When | Task | Task branch | Status | PR |
|---|---|---|---|---|---|
| A-01 | 9:00–11:10 | The story | `feat/A-01-the-story` | ✅ done | `docs/story/story.md`, `sources.md` (22 facts) |
| A-02 | 11:10–1:00 | Arizona scenario facts: Pocket Fire | `feat/A-02-arizona-scenario-facts-pocket-fi` | ✅ done | `data/scenario.json` |
| A-03 | 1:00–2:00 | Population numbers | `feat/A-03-population-numbers` | ✅ done | `docs/story/population.md` |
| A-04 | 2:00–5:00 | Talk to real responders | `feat/A-04-talk-to-real-responders` | 🟡 in progress | kit ready in `responders.md`; interviews to do |
| A-05 | 5:00–6:30 | Personas | `feat/A-05-personas` | ✅ done | `data/personas.json` (40) |
| A-06 | 6:30–10:00 | Deck v1 | `feat/A-06-deck-v1` | ⬜ todo | |
| A-07 | 10:00–12:00 | Demo script + Q&A | `feat/A-07-demo-script-q-a` | ✅ done | `docs/story/demo.md` |
| A-08 | 12:00–1:00 AM | Devpost draft | `feat/A-08-devpost-draft` | ⬜ todo | |
| A-09 | 3:00–5:00 | Impact numbers | `feat/A-09-impact-numbers` | ⬜ todo | |
| A-10 | 5:00–8:30 | Rehearse ×3 | `feat/A-10-rehearse-3` | ⬜ todo | |
| A-11 | 8:30–10:30 | Final deck, final Devpost with Prem: links (live app, repo, video),… | `feat/A-11-final-deck-final-devpost-with-pr` | ⬜ todo | |
| A-12 | 12:00–2:00 PM | Expo: you tell the story (first 20 seconds) and handle Q&A | `feat/A-12-expo-you-tell-the-story-first-20` | ⬜ todo | |

## How to work

- `feat/aarya` is your home branch, cut from `develop`. For each task you can work here, or cut a task branch
  (`feat/<ID>-<slug>`, names above) from `develop` and open a PR back into `develop`. Small PRs merge faster.
- Keep in sync: `git fetch origin && git rebase origin/develop` before you open a PR.
- Rules: [`AGENTS.md`](../../../AGENTS.md) · flow: [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) · shared shapes: [`docs/CONTRACT.md`](../../CONTRACT.md).
- Blocked more than 20 minutes → post in team chat with the task ID.

## Notes

- 2026-11-14: A-01/02/03/05/07 committed on `feat/aarya-story`. Posted to Yash: scenario.json + population rates.
- Heads-up for the team: in the real Pocket Fire the canyon went **straight to GO** (no SET stage). Demo shows a SET window; `demo.md` has the honest line for Q&A.
- `scenario.json` uses an event type `set` for the Flagstaff-side zones and adds `closure.action` (`close` / `residents_only` / `reopen`); Yash, shout if the seeder needs different names.
- Ignition point is approximate (no official coordinates published).
