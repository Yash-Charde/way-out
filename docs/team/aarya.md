# Aarya: story, data, validation, deck, video, Devpost

**You own:** why this matters (a real story and real numbers), the data the system runs on, what a firefighter told us, and how we present it.
**Folders:** `docs/story/`, `data/` (CSV/JSON you produce), the deck, the video, the Devpost page.
**Hours:** 9:00 AM → 1:00 AM (sleep 1–3 AM) → 3:00 AM onward.

**Rule for every number:** it goes into `docs/story/sources.md` with the link, the outlet, the date, and the exact figure *before* it goes on a slide. If a source says "under investigation" or "unknown cause," say that on the slide.

---

> **Now (Sat 3:45 PM): do A-13 first.** You're ahead of schedule, and nothing can go live until it's done. Hand-off to Yash by **5:15 PM** so the app is online for M1 at 6 PM.

## Tasks

| ID | Time | Task | Deliver |
|---|---|---|---|
| **A-01** | 9:00–11:10 | **The story.** Find **one real person or family** who couldn't get out of a wildfire on their own (older, disabled, no car) and died or barely survived. Look in the Camp Fire (2018), Lahaina (2023), Palisades/Eaton (2025), and any 2025–26 fires. **Don't reuse Standard Response's Eaton father-and-son story.** Also get the big numbers: deaths by age in those fires, the share of people with disabilities who can't evacuate without help, registry failures (e.g. Harvey), 911 overload | `docs/story/sources.md` (10+ sourced facts) + `docs/story/story.md` (the story in 5 sentences) |
| **A-02** | 11:10–1:00 | **Arizona scenario facts: Pocket Fire.** From InciWeb, Coconino County, and KNAU/KJZZ/AZFamily: start date and location, Ready/Set/Go status changes with times, acres over time, the **SR 89A closure** (times, segment), zones evacuated, number of homes, shelter location. Write `data/scenario.json`: `{ignition: [lon, lat], events: [{t, type: set\|go\|closure\|acres\|wind, ...}], wind: {speedMps, fromDeg}}` | `data/scenario.json` + sources. **Post to Yash by 1:00 PM** |
| **A-03** | 1:00–2:00 | **Population numbers** for Oak Creek Canyon / Sedona from **Census ACS** (data.census.gov): households, % age 65+, % 65+ living alone, % with ambulatory disability, % with no vehicle, % Spanish-speaking households. Fill the table in `docs/story/population.md`. Yash uses these rates to generate `data/population.csv` | Rates table. **Post to Yash by 2:00 PM** |
| **A-04** | 2:00–5:00 | **Talk to real responders** (this is what made Standard Response credible). Visit a **Tempe Fire Medical Rescue** station near campus, or call **ASU Emergency Management** or the **Sedona Fire District** non-emergency line. Ask: (1) In an evacuation, how do you find people who can't leave? (2) What breaks first: vehicles or information? (3) Would an AI calling every home at SET help or hurt? (4) What would worry you about neighbors picking people up? (5) What must a crew know before knocking? Get **one quotable line** (with permission and a name/role) and **one gap we should fix** | `docs/story/responders.md`. **Tell Deep / Yash any product change by 6 PM** |
| **A-05** | 5:00–6:30 | **Personas** for stand-ins + evals: 40 fictional residents in `data/personas.json`: `{id, name, age, language, truth: {canLeave, peopleCount, mobility, assistance, medical, pets, hasCar}, script: [what they say, in order], correction?: "...", tricky?: "pushes for a promise" \| "won't leave without dog" \| "hard of hearing" \| "speaks Spanish only"}`. Include **Rosa, 81** (the demo persona: says "just me," then "my husband is here, he's in a power chair, needs two people to lift") | `data/personas.json`. **Post to Deep by 6:30 PM** |
| **A-06** | 6:30–10:00 | **Deck v1** (8–9 slides, big type, one idea per slide): 1. The story · 2. The numbers · 3. The gap (dispatch is the bottleneck) · 4. Way Out in one picture · 5. Live demo (placeholder) · 6. How it works (architecture + honesty rule) · 7. Proof (`/system` numbers, sim result with ranges, responder quote) · 8. Sponsors used, and how · 9. What's next + team | Deck link in team chat |
| **A-07** | 10:00–12:00 | **Demo script + Q&A** in `docs/story/demo.md`: the 3-minute run (README "Demo script") with who clicks what and the exact lines. A 2-minute version. A Q&A table (e.g. "What if the AI promises a ride?", "Is the fire model validated?" → "It's a scenario input, not a forecast", "Isn't AI calling regulated?", "What if nobody answers?", "What does this cost per call?") | `demo.md` |
| **A-08** | 12:00–1:00 AM | **Devpost draft**: Inspiration (the story), What it does, How we built it (stack + sponsor table), Challenges, Accomplishments (with numbers), What we learned, What's next, Built with. **AI use disclosure** and **credits** (inspired by Standard Response + FireSight, no code copied) | Draft saved on Devpost (not submitted) |
| — | 1:00–3:00 | Sleep | |
| **A-09** | 3:00–5:00 | **Impact numbers** with Yash: agree on the simulation assumptions (call answer rate, how early 911 callers phone, boarding times, fleet size), get `data/sim-results.json`, make the one chart (today vs Way Out, median with a range). Update the deck and Devpost with **real** numbers from `/system` and evals | Final numbers in deck |
| **A-10** | 5:00–8:30 | **Rehearse ×3** with Prem (time each run; cut anything over 3:00). **Record the 2-minute video**: screen capture of the console + phone audio for the call (backup in case live calls fail at the expo) | Video uploaded (YouTube unlisted) |
| **A-11** | 8:30–10:30 | Final deck, final Devpost with Prem: links (live app, repo, video), screenshots, **submit by 10:30** | Submitted ✅ |
| **A-12** | 12:00–2:00 PM | Expo: you tell the story (first 20 seconds) and handle Q&A | |
| **A-13** | **3:45–5:15 PM (now)** | **Go-live accounts** (taken over from Prem's P-04). Follow `infra/README.md` → Go-live checklist, steps 1–5 marked **Aarya**: Atlas M0 cluster + DB user + `0.0.0.0/0` → `MONGODB_URI`. `secrets.env` from `.env.example` (ask Deep and Yash for keys **in a private message, never the group chat**; `INTERNAL_TOKEN` = `openssl rand -hex 24`). Claim Vultr MLH credits → Ubuntu 24.04 VM, 2 vCPU / 4 GB → run `bootstrap-vm.sh`. Claim the GoDaddy Registry domain (MLH offer) → A records `api-dev`, `api-staging`, `api` → VM IP. Make the CI deploy key and add its public half to the VM | Private note to Yash: VM IP, domain, `wayout_deploy` private key. `dig +short api-dev.<domain>` shows the VM IP |

## Slide rules
- One number per slide, huge, with the source in small text underneath.
- Real photos only from sources with permission, or none. **Never** a photo of the person in the story unless their family made it public and you credit it.
- Simulated results always say "simulated" on the slide.
- End on one sentence the judges will repeat. Draft: *"The van was ready. Nobody called. Everyone deserves a way out."*

## Things worth having ready for judges
- The responder quote, on a slide and on Devpost
- One screenshot each: console mid-incident, driver offer card, call transcript, `/system`
- Sponsor one-liners: **Gemini** (live call understanding + photo vision), **MongoDB** (geo + vector search + change streams), **Vultr** (dev/staging/prod API), **TinyFish** (SET trigger from county pages), **Tiger Data** (vehicle tracks, fire detections, call latency), **GoDaddy Registry** (domain)
