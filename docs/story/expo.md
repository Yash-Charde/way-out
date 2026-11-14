# Video (A-10) and expo (A-12) cheat sheet

## A-10: rehearse ×3, then record the 2-minute video

**Rehearsal (with Prem).** Run the 3-minute script in `demo.md` three times with a stopwatch. After each run write the time and the one step that ran long; cut that step's optional line, never the close.

| Run | Time | What ran long | Cut |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

**Recording setup**
- Screen capture of the console (`/console`) at 1920×1080, browser zoom 100%, notifications off.
- Phone audio for the call: speaker phone next to the laptop mic, or record the phone separately and line it up.
- A quiet room. One take per segment is fine; join them in any editor.

**Shot list (2:00)**

| Time | Picture | Voice-over (Aarya) |
|---|---|---|
| 0:00 | Black screen, then slide 1 (text only) | “Rory Sykes was blind and couldn’t walk well. In the Palisades Fire, his mom couldn’t lift him, 911 didn’t connect, and by the time help came, his home was gone.” |
| 0:12 | Console: Oak Creek Canyon zone flips to SET, homes light up | “When an evacuation zone changes, Way Out calls every home at once.” |
| 0:25 | Call floor + record panel while Rosa corrects herself | Let the call audio play. Lower it under: “The record changes while she’s still talking.” |
| 0:45 | Rosa asks “Is someone coming?” | Let the agent’s honest answer play in full. |
| 0:55 | Press A to approve, then driver phone taps Accept, then Rosa’s phone rings | “Approval is silent. Only when a driver accepts does Rosa hear a name and a time.” |
| 1:20 | SR 89A closes, the ride is revoked, Rosa is told, the neighbor accepts, the late tap is rejected | “When the road closes, she hears the truth at once, and a neighbor takes the run.” |
| 1:45 | `/system` page with **SIMULATED** visible | “In simulation, [__]% picked up on time vs [__]% for greedy dispatch.” |
| 1:55 | Close slide | “The van was ready. Nobody called. Everyone deserves a way out.” |

Upload to YouTube as **Unlisted**, title “Way Out — SunHacks 2026”, and paste the link into Devpost (A-11).

## A-12: expo, 12:00–2:00 PM

**Your first 20 seconds, every time:** the Rory Sykes lines from `story.md`, then “Way Out calls every home at once and gets the people who can’t leave matched with someone who can take them.”

**Then hand off:** “Want to be the resident? Put your number in and it’ll call you.” (the `/` kiosk page)

**Five answers to have ready** (full table in `demo.md`):
1. *Promises?* “It can’t make one. Ride sentences are templates chosen by status; a guard blocks the rest.”
2. *Fire model?* “A scenario input, not a forecast.”
3. *AI calls legal?* “Emergency-purpose calls are exempt from the consent rule; we’d run it through the county.”
4. *No answer?* “Retry at 2 and 5 minutes, text, then the door-knock list.”
5. *Real or simulated?* “The call, agent, guard, map and driver app are real. Homes, other drivers and the timeline are simulated and labeled.”

**Don't say:** “we interviewed a firefighter” (we used published quotes), “this saves lives” (we measured on-time pickups in simulation), or any number that isn’t on `/system`.
