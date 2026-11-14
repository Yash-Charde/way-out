# Deep: resident side (voice agent, calls, honesty, evals)

**You own:** everything a resident hears and everything we learn from them.
**Folders:** `voice/`, `api/agent/`, `api/routes/agent.py`, `api/routes/calls.py`, `api/routes/zones.py`, `evals/`, `web/app/page.tsx` (kiosk), `web/app/calls/`, `web/app/system/`
**Hours:** 11:10 AM → 3:00 AM (sleep 3–5 AM) → 5:00 AM onward for fixes and the demo.

Read first: `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`, `docs/CONTRACT.md` §2, §4, §5.

---

## Design in one paragraph

Cartesia Line runs the phone call: number, speech-to-text (Ink), voice (Sonic), turn-taking. Our Line agent is a **thin client**: on every resident utterance it POSTs the text to **`/agent/turn`** and speaks back the `say[]` list it gets. All the logic lives in the API, so the exact same agent runs over text for tests and evals. Inside `/agent/turn`: **Gemini** interprets the utterance into JSON (CONTRACT §5). A **state machine** updates the record and picks the next question. **Templates** produce every ride-status sentence. The **honesty guard** filters the AI's short acknowledgment. If Gemini takes longer than 2.5 s or fails, **Claude Sonnet** gets the same prompt.

## Tasks

| ID | Time | Task | Done when |
|---|---|---|---|
| **D1-01** | 11:10–12:30 | **Cartesia hello-world → thin client.** Install `cartesia-line`, `cartesia auth login`, create the agent, deploy, `cartesia call <your phone> <agent_id>`. Find the Line SDK's **custom agent** API (an agent you write yourself, not `LlmAgent`) that lets *our code* choose each spoken sentence. Make it call `POST /agent/start` at pickup and `POST /agent/turn` per utterance (Bearer `INTERNAL_TOKEN`), and speak `say[]`. **Fallback** if there's no custom agent: `LlmAgent` with one tool `turn(text)`, prompted to read its result verbatim (weaker; say so in the PR) | Your phone rings and the agent says the greeting returned by a stub `/agent/start` |
| **D1-02** | 12:30–2:30 | **State machine + templates** (`api/agent/flow.py`, `templates.py`, en + es). Stages: `greet → confirm_address → can_leave → household (people, pets) → needs (mobility, oxygen) → chair_kind (if wheelchair) → assistance → readback → neighbor → status/hold → goodbye`. Re-ask once with simpler wording, then escalate. `POST /agent/start`, `POST /agent/turn`. A CLI `uv run python -m agent.chat` to talk to it by text | Text chat completes a call and fills a record |
| **D1-03** | 2:30–4:00 | **Interpreter + honesty.** `api/agent/interpreter.py`: Gemini (`GEMINI_MODEL`) with the CONTRACT §5 JSON schema and the call-taker principles (below). Claude fallback at 2.5 s. `api/agent/honesty.py`: drop the ack if it contains digits, or matches promise / false-comfort / advice patterns while status ∈ {none, received, approved, reassigning}. Tests: 30 promise lines blocked, 30 neutral lines pass | `pytest api/agent` green; a correction ("no wait, my son is here") changes the record |
| **D1-04** | 4:00–5:45 | **Record → request.** On each turn: `PATCH` record, log corrections, compute `need` (seats, wheelchair, stretcher, crew, lift). When `canLeave = no` (or `hasCar = false` with mobility limits), create/update a **request** via `requests.py`. Medical, flames, or "address unclear ×2" → `escalate`. Emit `call.turn` events (with `latencyMs`, `requestStatus`). **`/calls` page:** live calls list on the left; on the right the selected call's transcript streaming in, with the record fields filling and a latency chip per agent turn | **M1 (6 PM):** real call → record fills on `/calls` → red request on Yash's map |
| **D1-05** | 6:00–8:00 | **Dialer + reach ladder.** `POST /calls/dial` (Cartesia outbound for real phones; stand-in for `simulated` homes). Queue = in-zone homes, highest priority first, 1 call/s. Ladder: no answer → retry 2 min → retry 5 min → text (simulated) → `door_check`. **Stand-in voice:** simulated homes run the *real* `/agent/turn` with persona replies from `data/personas.json` (Aarya), ~20 in parallel, so the census fills for real | Hitting "SET" fills 200 homes in a few minutes |
| **D1-06** | 8:00–10:00 | **Callbacks + live status.** Worker watches `callbacks` (state `queued`) → call the household (real or stand-in) → speak the status template → mark `played` / `unanswered` (retry once). During any call, check the request status every turn and announce a change at the next sentence | **M2 (10 PM):** driver accepts → Rosa's phone rings with name + ETA; road closes → "Your driver can no longer reach you…" |
| **D1-07** | 10:00–11:15 | **TinyFish SET trigger** (a named prize: **Best Use of TinyFish**, so it must work live in demo step 2). Build `web/app/drill/page.tsx`: a **plainly labeled "Way Out drill page"** (never styled as a county site) showing our test zone's Ready/Set/Go status, with a toggle. A TinyFish agent (cron every 60 s on the API) reads it and calls `POST /zones/{id}/status`. `status = set` → dialer starts. Also try one *read-only* TinyFish fetch of the real Coconino County emergency page and log what it sees (for the pitch) | Flip the drill page to SET → calls start with no other click |
| **D1-08** | 11:15–12:15 | **Dedupe + kiosk.** Gemini embeddings of `address + names + needs` → Atlas Vector Search → if score > 0.9 **and** within 50 m → mark `dupOf`, merge needs. Kiosk `/`: pick a house on the map + enter a phone number → that house becomes the real-phone household → dial | Two callers for the same home → one request. A judge can trigger their own call |
| **D1-09** | 12:15–1:00 | **Evals + /system.** `evals/run.py`: 40 personas over `/agent/turn` (EN + ES). **Claude Opus judge** grades every agent line for implied promises and checks per-field accuracy → `evals/results.json`. `/system` page: latency p50/p95 (from Tiger Data `call_turns`), honesty (lines judged, implied promises found), per-field accuracy, audit trail | `/system` shows real numbers, not placeholders |
| **D1-10** | after D1-06, ~30 min | **Claude on Amazon Bedrock** (for the **Best Use of AWS** prize, added 4:20 PM from the opening slides). Set `CLAUDE_PROVIDER=bedrock` → `_claude()` calls Bedrock instead of `api.anthropic.com`: same prompt, same JSON, same 2.5 s timeout (`AsyncAnthropicBedrock` from `anthropic[bedrock]`, or boto3 `bedrock-runtime`; one-line reason in the PR). Run the Opus eval judge (D1-09) on Bedrock too. Log `source: "claude-bedrock"` so `/system` can show it. AWS keys come from Aarya after the Amazon Bedrock workshop (5:30–6:30 PM). Settings already exist: `CLAUDE_PROVIDER`, `AWS_REGION`, `BEDROCK_FALLBACK_MODEL`, `BEDROCK_JUDGE_MODEL` | A real Bedrock reply shows in a call turn, and the judge run lists Bedrock |
| — | **1:00 AM** | **Feature freeze (M3).** Only `demo-blocker` fixes after this | |
| D1-10 | 1:00–3:00 | Fix what Prem's end-to-end run finds. Re-run evals and update the numbers for Aarya | |

## The call-taker principles (put these in the interpreter prompt and the judge)
1. **Truth over comfort.** Say only what the record supports. "I don't know that yet" beats a guess about fire, roads, or timing.
2. **Promise effort, never outcomes.** Never say or imply someone is safe, that help is coming, or when.
3. **Calm and short.** One idea per sentence, plain words.
4. **Show you heard.** Reflect their words briefly ("A power chair.").
5. **Name a feeling once, then move on.** Never scripted sympathy.
6. **Say why you ask** when they ask ("so we send a vehicle that fits the chair").
7. **Honest about automation.** "I'm the Way Out automated assistant, working with the dispatchers."
8. **Life threats first.** Medical emergency or flames → flag immediately.
9. **Respect their choice** if they won't leave. Don't argue.
10. **Adult to adult.** Take their word about a disability.

## Latency budget
Interpreter ≤ 1.0 s p50. Keep the JSON short. Run the record write and events as fire-and-forget. Log `latencyMs` on every turn into Tiger Data `call_turns`.

## Claude Code starter prompt (D1-02 + D1-03)
```
Read README.md, AGENTS.md, docs/CONTRACT.md and docs/team/deep.md. On feat/D1-02-agent-flow build
api/agent/: flow.py (state machine with the stages in deep.md, re-ask once then escalate),
templates.py (en + es, status lines exactly per CONTRACT §4), and POST /agent/start and /agent/turn
returning {say, stage, done, record, requestStatus}. Add a text CLI (python -m agent.chat). Then on
feat/D1-03-interpreter add interpreter.py (Gemini JSON schema from CONTRACT §5 with the 10 principles,
Claude Sonnet fallback after 2.5 s) and honesty.py (drop acks with digits or promise/comfort/advice
patterns while no driver has accepted). The AI never writes status, ETAs or names. Tests first.
```
