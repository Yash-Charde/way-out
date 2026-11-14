# Responders (A-04)

> **Status (2026-11-14):** no in-person interview was done. For the hackathon we use **published, on-the-record quotes** from responders and officials, each cited in `sources.md`. On slides and Devpost they are labeled as published quotes, **never** as "we interviewed". If someone does talk to a responder later, add it under "Interview kit" and swap the quote.

## Published voices we can use

| Use | Quote (exact, short) | Who | Source |
|---|---|---|---|
| **Main quote (slide 3 + Devpost)** | "By the time my staff could make those calls, the fire had already run…" | Shelby Boston, Butte County social services director, on phoning ~1,500 in-home-care clients during the Camp Fire | F-23 |
| Arizona color (slide 2 or demo) | "It's hot, it's dry, it's windy, it's difficult access" | Jayson Coil, assistant fire chief, Sedona Fire, on the Pocket Fire | F-24 |

Same source article as the main quote (paraphrase only, don't quote): Butte County's emergency manager told residents to get to know their neighbors because they may need each other, and said planned pickup points were "in the making" but the fire moved too fast. That's the case for our neighbor drivers.

## The gap we fix (from the after-action record)

**The list exists, but the calls happen too late.** Butte County had the names. Staff started dialing that morning and had to stop because the fire was faster than one person per phone (F-08, F-23). In Eaton, the 911 system itself was overwhelmed (F-15). In LA, police dispatchers at one point routed 911 calls through a single captain's personal cellphone (F-25).

**What Way Out changes:** every home is called at once the moment the zone changes status, and the person who can't leave goes straight onto a dispatcher's map with a deadline. Nobody waits in the 911 queue to say "my husband is in a power chair".

**A gap we still have (honest, for Q&A):** crews also need access details (stairs, gate codes, where in the house). Our call script doesn't ask for them yet. That's a "what's next" item.

---

## Interview kit (optional, if anyone talks to a responder)

### Who to contact

| Priority | Who | How | Notes |
|---|---|---|---|
| 1 | **Tempe Fire Medical Rescue, Station 1 (271)** | Walk in: **1450 E. Apache Blvd, Tempe**, a few minutes from campus (address from a public station list; confirm on tempe.gov/fire-stations) | Staffed 24/7, so weekends are fine. Go between calls; if the engine is out, wait or come back. Ask for the captain on duty. Department admin: 480-858-7200 (weekdays). |
| 2 | **Sedona Fire District** (the agency that worked the Pocket Fire) | Admin **928-282-6800** (Mon–Thu, 7–5). Non-emergency dispatch 928-649-1397 is for service calls; only use it to ask who to email. | Weekday follow-up. They know Oak Creek Canyon and Ready/Set/Go first-hand. |
| 3 | **ASU Emergency Management** | ASU Emergency Preparedness **480-965-6328** (weekdays) | Good for "how do you find people who can't leave" from a campus angle. |
| 4 | **Coconino County Emergency Management** | Director Tim Carter, 928-679-8368, tcarter@coconino.az.gov (from a 2025 public contact list; confirm before using) | They issue the canyon's Ready/Set/Go. Email is best: short ask + 2 questions. |

Never call 911 or a dispatch line for this.

### What to say (30 seconds)

> "Hi, I'm Aarya, a CS grad student at ASU. I'm at SunHacks this weekend building a tool for wildfire evacuations: when a zone goes to SET, it calls every home, finds out who can't leave on their own, and matches them to a vehicle that can get them. A dispatcher approves every match. Could I ask you five quick questions? If you're OK with it, I'd like to quote one line with your name and role, and I'll show you exactly what I'd quote before I use it."

**Permission, every time:** "Can I quote that, with your name and role?" Write down their exact answer. If they say no, or "not my name", use the role only ("a Tempe fire captain") or don't use it.

### The five questions

1. In an evacuation, **how do you find the people who can't leave on their own?** (Lists? Door knocks? Calls from family?)
2. **What breaks first: vehicles or information?** (Do you run out of rigs, or do you not know where the people are?)
3. Would an **AI calling every home at SET** help you or hurt you? What would make you trust it? What would make you turn it off?
4. What would **worry you about neighbors picking people up?** (Liability, safety, someone driving into the fire)
5. **What must a crew know before knocking on a door?** (Number of people, oxygen, wheelchair weight, dogs, stairs, gate codes)

Follow-ups if there's time:
- "If our tool said 'Rosa, 81, plus husband in a 300-lb power chair, needs two-person lift, deadline 40 minutes', is that useful, or too much?"
- "Who should approve a pickup: dispatch, the IC, or nobody (driver just accepts)?"
- "Is there anything here that would get someone hurt?"

### Notes (fill in)

| Field | Answer |
|---|---|
| Name, role, agency | |
| Date / time / place | |
| Permission to quote (exact words) | |
| Q1 how they find people | |
| Q2 vehicles vs information | |
| Q3 AI calling at SET | |
| Q4 neighbor pickups | |
| Q5 before knocking | |
| **One quotable line** | |
| **One gap we should fix** | |
| Product change to tell Deep/Yash (by 6 PM) | |

### What we're listening for (maps to product decisions)

| If they say… | Then we… |
|---|---|
| "We don't know where they are" | Lead the pitch with the census map, not the van. |
| "Neighbors are a liability" | Keep the neighbor role but require dispatcher approval for neighbor runs, and show that in the demo. |
| "Don't call at SET, people panic" | Change the first call's tone to "get ready" and only ask the census questions; save "leave now" for GO. |
| "Crews need oxygen / weight / dogs / stairs / gate codes" | Add any missing field to the call script (Deep) and the driver card (Prem). Today we capture oxygen, mobility, lift, pets, people. **Stairs and gate codes are not captured yet.** |
| "Silence means they left" | Keep "silence is never safe". Ask them why, and note it. |
