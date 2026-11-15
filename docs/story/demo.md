# Demo script + Q&A (A-07)

**Roles (confirm at rehearsal):** Aarya = story, narration, close, Q&A · Prem = console (dispatcher) · Yash = driver phone · Deep = call/agent watch, backup "Rosa" if a judge won't play her.
**Screens:** laptop on the console map (`/console`), driver phone on `/driver`, judge's phone (or Deep's) for the call. Everything simulated carries the **SIMULATED** badge.
**Hard cap: 3:00.** If a step is late, skip the next optional line, not the close.

---

## 3-minute version

| Time | Who | Does | Says (exact) |
|---|---|---|---|
| 0:00 | Aarya | Title slide | "Rory Sykes was 32. He was blind and couldn't walk well. When the Palisades Fire came, his mom had a broken arm and couldn't lift him. 911 didn't go through. She drove to the fire station for help, and when she got back, his home was gone." |
| 0:15 | Aarya | — | "He didn't need a miracle. He needed two people and a phone call that connected. That's Way Out." |
| 0:20 | Prem | Flips the Pocket Fire zone to **SET** (county page → TinyFish) | Aarya: "This is Oak Creek Canyon, near Sedona, in the Pocket Fire this June. Half the people who live here are over 65. The moment the zone goes to SET, Way Out calls every home at once." *(map lights up)* |
| 0:35 | Deep → judge | Judge's phone rings. Hand them the Rosa card | Aarya: "You're Rosa. You're 81. Just answer naturally." |
| 0:40 | Judge (as Rosa) | Answers; says "just me", then corrects: "my husband is here, he's in a power chair" | Aarya (pointing at console): "Watch the record. One person… now two. Power chair. Two-person lift. It changed live." |
| 0:55 | Judge | Asks "Is someone coming?" | Agent: **"You're on the rescue list as high priority. No driver has accepted yet. I'll call you back the moment one does."** · Aarya: "It won't promise a ride it doesn't have. That's enforced in code, not in the prompt." |
| 1:05 | Prem | Runs plan; presses **A** to approve | Aarya: "The optimizer gives Rosa the only van with wheelchair space and two crew. The dispatcher approves. Approval isn't a promise, so Rosa hears nothing yet." |
| 1:25 | Yash | Taps **Accept** on the driver phone | Judge's phone rings: **"A wheelchair van with a two-person crew is 7 minutes away. The driver's name is Luis. I'll call again if anything changes."** |
| 1:45 | Prem | Triggers the SR 89A closure (fire jumps the road) | Aarya: "Now the fire jumps 89A, the canyon's main road out. No route reaches Rosa in time." · Rosa's phone: **"Your driver can no longer reach you. You're still at the top of the list. I'll call the moment a new driver accepts. If you can leave safely, leave now."** |
| 2:00 | Yash | Taps the old offer again (late tap) | Aarya: "A neighbor uphill who's already leaving accepts. And the old driver's late tap? Rejected. Exactly one driver wins." |
| 2:15 | Yash | Drops the phone on the table | Aarya: "Drivers matter too. Phone drops, goes still: 'Are you OK?' No answer: MAN DOWN on the console, with coordinates." |
| 2:30 | Prem | Opens `/system` | Aarya: "In simulation, 91% picked up before their deadline with Way Out, versus 48% with today's 911 queue, with ranges. Every call judged for honesty. Latency." *(read the real numbers from the screen, and say "simulated")* |
| 2:50 | Aarya | Close slide | **"The van was ready. Nobody called. Everyone deserves a way out."** |

## 2-minute version (video / short slot)

1. **0:00** Story, two sentences: "Rory Sykes was blind and couldn't walk well. In the Palisades Fire, his mom couldn't lift him, 911 didn't connect, and by the time help came, his home was gone."
2. **0:12** SET in Oak Creek Canyon → every home called at once.
3. **0:25** Rosa's call: correction to "husband in a power chair" + "Is someone coming?" → honest template.
4. **0:55** Approve (silent) → driver accepts → Rosa hears name + ETA.
5. **1:20** SR 89A closes → revoke → Rosa told the truth → neighbor accepts.
6. **1:45** `/system` numbers (simulated) → close line.

Cut for time: man-down, the late tap.

## If something breaks

| Breaks | Do |
|---|---|
| Real call doesn't ring | Deep switches to the stand-in voice; Aarya: "We'll use our recorded call; same agent, same templates." Play the backup video segment if needed. |
| Map doesn't light up | Keep talking over the call; the record panel is the point. |
| `/system` empty | Show the slide with the same numbers (from `data/sim-results.json`). |
| Over 2:45 | Skip straight to the close line. |

## A true fact to have ready (don't overclaim)

In the real Pocket Fire, the canyon went **straight to GO about two hours after the fire was reported**, with no SET stage (sources S-02, S-04). Our demo shows a SET window. If asked: "In June there was no SET window at all, which is the point: whenever the order comes, you need to know right then who can't leave. Way Out calls at SET if there is one, and at GO if there isn't."

---

## Q&A

| Question | Answer (short) |
|---|---|
| **What if the AI promises a ride?** | It can't. Every sentence about a ride is a fixed template chosen by the request's status. The model only writes a ≤ 6-word acknowledgment, and a guard drops it if it sounds like a promise or has any digit in it. Our honesty judge checks every call. |
| **Is the fire model validated?** | No, and we don't claim it is. It's a scenario input, not a forecast. In a real deployment the deadline per home would come from the incident team or an operational spread model. |
| **Isn't AI calling regulated?** | Yes. The FCC ruled in Feb 2024 that AI-generated voices count as "artificial" voices under the TCPA, so they need consent *unless the call is for an emergency purpose* (F-22). We'd deploy through the county's emergency management, which already sends emergency notifications, and every call says who's calling. |
| **What if nobody answers?** | Silence is never "safe". Retry at 2 minutes, again at 5, then a text, then the home goes on the door-knock list for field crews, ranked by fire deadline. |
| **What does this cost per call?** | Give the number from our own logs on `/system` (voice minutes + model tokens per call). Don't guess. If we don't have it yet: "A few cents to tens of cents per call at today's voice and model prices; we'll show the measured number." |
| **Why not just use the disability registry?** | Registries help, but most people aren't on them (in one Texas survey, 6% were; F-19), and even when counties call them, they reach only part of the list (605 of 1,030 after Hurricane Beryl; F-18). We call everyone, and the registry becomes a priority boost. |
| **What about people without phones?** | They end up on the door-knock list, same as no-answers. We don't pretend the phone reaches everyone. |
| **Spanish?** | The agent detects Spanish and switches; templates exist in both languages. In Oak Creek Canyon about 8% of households speak Spanish at home (C-01). |
| **Who's liable if a neighbor driver crashes?** | A dispatcher approves every plan, and neighbors only get offers after approval. Liability rules for volunteer drivers are a real open question; we'd follow the county's existing volunteer framework (CERT-style). Butte County's own emergency manager told residents to get to know their neighbors because they may need each other (F-23 source, paraphrased). |
| **What's real vs simulated?** | Real: the call, the agent, the templates, the honesty guard, atomic accept, the console and driver app. Simulated (and labeled): the 200 homes, other drivers, the fire timeline compression, and impact numbers. |
| **Did you talk to responders?** | Not in person. We used published, on-the-record statements from responders and officials, cited in `sources.md`, and the official after-action reviews. |
| **Did you copy Standard Response / FireSight?** | No code. We were inspired by their ideas (call-every-home census, honesty templates, hazard vision, man-down) and credit them. Everything here was written at SunHacks. |
