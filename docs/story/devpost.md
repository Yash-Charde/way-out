# Devpost draft (A-08)

> Paste each section into Devpost and **save as draft; don't submit** (A-11 submits by 10:30 AM).
> Every `[__]` is a number we fill from `/system` or `data/sim-results.json` at A-09. Don't publish a `[__]`.
> Before submitting, delete any sponsor or feature line that didn't actually ship.

**Project name:** Way Out
**Tagline (≤ 60 chars):** Call every home at once. Get everyone a way out.

---

## Inspiration

Rory Sykes was 32. He was blind and had cerebral palsy, and he couldn't walk well. When the Palisades Fire reached his family's land above Malibu in January 2025, his mother had a broken arm and couldn't lift him. She says 911 wouldn't go through, so she drove to the nearest fire station for help. When she got back, his cottage had burned.

His story isn't rare. In the 2018 Camp Fire, 53 of the 69 victims identified by early 2019 were over 65. In Lahaina in 2023, more than two-thirds of the 100 people who died were 60 or older. The people who die in wildfires are mostly the ones who can't leave on their own.

Counties know this. Butte County had a list of people who'd need help, and staff started phoning in-home-care clients the morning of the Camp Fire. Its social services director later said that by the time staff could make those calls, the fire had already run through the areas they were most worried about. The list existed. Nobody had the hands to call it in time.

This year it happened in Arizona. The Pocket Fire (June 2026) forced the evacuation of Oak Creek Canyon near Sedona and closed SR 89A, the canyon's main road, for 25 days. About half the people who live in that canyon are 65 or older. We built Way Out for that canyon.

## What it does

When an evacuation zone changes status, Way Out **calls every home at once**, in English or Spanish, and asks a few plain questions: can everyone leave, how many people, can they walk, do they need help getting out, oxygen, pets, a car.

Each call fills a live record on a dispatcher's map: **red** needs a ride, **orange** can help a neighbor, **green** is already out. Nobody who answers waits in a 911 queue to explain that her husband is in a power chair.

An optimizer matches each person who needs a ride to a vehicle with the right seats, wheelchair space and crew, before that home's fire deadline. A dispatcher approves the plan with one key. Each driver (county van, paratransit, or a neighbor who's already leaving) accepts or declines on their phone. **Only when a driver accepts** does the resident get a call back with the driver's name, the vehicle and the ETA.

When things change, people hear the truth right away. If the fire closes the road and the driver can't get through, the ride is revoked, the resident is told at once, and a new driver is found. A late tap on the old offer is rejected.

Silence is never "safe". No answer means retry at 2 minutes, again at 5, then a text, then the home goes on the door-knock list for field crews.

Drivers are protected too. The driver app shows fire distance, flags a route into the fire buffer, and sends SOS or MAN DOWN (impact, then stillness) with coordinates.

## How we built it

- **Voice:** Cartesia Line (phone numbers, speech-to-text, text-to-speech) runs the calls.
- **Understanding:** Gemini Flash turns each answer into a structured update to the household record (JSON schema output), including corrections mid-call ("actually, my husband is here").
- **Honesty, enforced in code:** the model never writes ride status, ETAs, driver names or promises. Every sentence about a ride is a fixed template chosen by the request's status, and a guard drops any model acknowledgment that sounds like a promise or contains a digit. Claude Opus grades every agent line in our evals.
- **Data:** MongoDB Atlas for households, requests, vehicles and offers: geo queries, Vector Search for de-duplicating callers, and change streams that push every update to the dispatcher's map over a WebSocket.
- **Dispatch:** Google OR-Tools solves a pickup-and-delivery routing problem with time windows and capacities, re-solved on every change. Greedy earliest-deadline-first is the baseline and fallback.
- **Atomic accept:** a driver's accept is a single compare-and-set, so two drivers tapping the same offer can't both win. Request status changes only along legal transitions, with an audit log.
- **Fire deadlines:** elliptical (FARSITE-style) spread from satellite fire detections and wind gives each home a deadline. It's a scenario input, not a validated forecast.
- **Triggers:** TinyFish watches Ready, Set, Go status pages and starts the calls when a zone changes.
- **Time series:** Tiger Data stores vehicle tracks, fire detections and call latency for the `/system` page.
- **Frontend:** Next.js, Tailwind, shadcn/ui, MapLibre GL and deck.gl. The dispatcher console is map-first; the driver app is a phone PWA built for one hand and bright sun.
- **Infra:** Vultr VM with dev, staging and prod API containers behind Caddy; web on Vercel; domain from GoDaddy Registry.
- **Scenario data:** a real timeline of the Pocket Fire (Coconino National Forest, City of Sedona, KNAU) and Census ACS rates for Oak Creek Canyon drive 200 **simulated** homes, labeled as simulated on every screen.

### Sponsor table

| Sponsor | How we used it |
|---|---|
| Gemini | Live call understanding; photo reports of smoke and blocked roads |
| MongoDB | Geo queries, Vector Search, change streams for the live map |
| Vultr | Dev, staging and prod API hosting |
| TinyFish | Watches Ready, Set, Go pages and triggers the calls |
| Tiger Data | Vehicle tracks, fire detections, call latency |
| GoDaddy Registry | Our domain |

## Challenges we ran into

- **Making "no promises" a property of the code, not the prompt.** Prompts drift under pressure ("just tell me someone's coming"). We moved every ride sentence into status-based templates and put a guard after the model.
- **Two drivers, one offer.** Under load, two accepts can land in the same millisecond. We made accept a single atomic update and tested 20 concurrent accepts: exactly one wins.
- **Being honest about what's simulated.** The homes, most drivers and the fire timeline are simulated; we label it everywhere and report ranges, not single numbers.
- **The real timeline didn't match our plan.** In the real Pocket Fire, the canyon went straight to GO about two hours after the fire was reported, with no SET warning window. Way Out has to work at GO too.

## Accomplishments that we're proud of

- A real phone call that updates a dispatcher's map while the person is still talking, including a mid-call correction.
- **[__]/[__]** agent turns passed the honesty judge (no promise before a driver accepted).
- In simulation, **[__]%** of people who needed a ride were picked up before their deadline, vs **[__]%** for greedy dispatch (median over [__] runs, range [__]–[__]).
- Median voice turn latency **[__] ms** (p95 [__] ms).
- 77 backend tests, including every illegal status transition and 20 concurrent accepts.
- 22 sourced facts behind every number in our story; nothing on a slide without a citation.

## What we learned

- The hard part of evacuating people who can't leave isn't the vehicles. It's knowing, in minutes, who they are and what they need.
- Honesty has to be designed. A system that says "help is on the way" before it is does real harm.
- Real incident data is messy: acreage gets revised down after better mapping, and evacuation stages get skipped. Building against a real timeline made the product better.

## What's next for Way Out

- Ask what crews need before they knock: stairs, gate codes, where in the house.
- Plug into the Ready, Set, Go alerts a county already sends, and pilot with a county emergency management office.
- More languages than English and Spanish.
- The same engine for floods and heat emergencies.

## Built with

`python` `fastapi` `mongodb-atlas` `atlas-vector-search` `google-or-tools` `gemini` `cartesia` `claude` `tinyfish` `tiger-data` `timescaledb` `next.js` `tailwindcss` `shadcn-ui` `maplibre` `deck.gl` `vultr` `caddy` `vercel` `godaddy-registry` `nasa-firms`

## AI use disclosure

- **At runtime:** Gemini Flash interprets calls and photos; Claude Sonnet is a fallback interpreter; Claude Opus grades agent lines in evals. No model writes ride status, ETAs or driver names; those come from code templates.
- **While building:** we used Claude Code and Cursor as coding assistants. Claude also helped research and draft the problem section, sources, deck and this write-up; every number was checked against the cited source.

## Credits

Ideas from **Standard Response** (Cal Hacks 13.0: call-every-home census, status-template honesty, atomic accept) and **FireSight** (LA Hacks 2026: hazard vision, wearer SOS / man-down). **No code was copied**; both repos have no license and MLH rules forbid reusing earlier code. Everything in our repo was written at SunHacks.

Data: Coconino National Forest, City of Sedona, KNAU, KJZZ, AZFamily, KTAR (Pocket Fire timeline); U.S. Census Bureau ACS 2019–2023 (population). Full list: `docs/story/sources.md`.

Simulated households, drivers and fire timelines are labeled as simulated. Fictional people only; no real resident data.
