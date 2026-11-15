"""Dialer + reach ladder.

When a zone is at SET (or GO), every home in it gets called, highest priority first:
earliest fire deadline first, homes we already know need help before unknown ones.

  real phones   → Cartesia outbound (POST /agents/calls), at most `dial_rate_per_s` (1/s per number)
  simulated     → a stand-in resident on the real agent (standin.py), up to `standin_concurrency`
                  at once. Only while the `voice` stand-in is on (POST /sim/control).

Silence is never "safe" (ARCHITECTURE §7.2):
  no answer → retry_2 (2 min) → retry_5 (5 min) → texted (simulated text) → door_check (3 min later)

The queue is the database itself: a household is due when its zone is active and its `reach` and
`nextAttemptAt` say so. Any API replica can run the loop, and nothing is lost on restart.
Household fields used: reach, dialAttempts, nextAttemptAt, lastDialAt (additive, see CONTRACT §1).
"""

import asyncio
import hashlib
import logging
import time
from datetime import datetime, timedelta
from typing import Any

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from api import audit
from api.agent import standin
from api.core.config import get_settings
from api.core.util import aware, new_id, utcnow

log = logging.getLogger(__name__)

ACTIVE_ZONE_STATUSES = ("set", "go")
LADDER_MIN = {"retry_2": 2.0, "retry_5": 5.0, "texted": 3.0}
RING_TIMEOUT_S = 30  # how long a real phone rings
ANSWER_GRACE_S = 20  # time for the Line agent to call /agent/start after pickup
STANDIN_NO_ANSWER = 0.12  # share of stand-in attempts that ring out (exercises the ladder)
STANDIN_NEVER = 0.03  # share of stand-in homes that never answer (end on the door-knock list)
BUSY = ("ringing", "in_call")
CARTESIA_URL = "https://api.cartesia.ai/agents/calls"
CARTESIA_VERSION = "2026-08-14"


class DialError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


_tasks: dict[str, asyncio.Task] = {}  # household id → running stand-in call


def running() -> int:
    return sum(1 for t in _tasks.values() if not t.done())


async def drain() -> None:
    """Wait for every running stand-in call (tests, shutdown)."""
    while pending := [t for t in _tasks.values() if not t.done()]:
        await asyncio.gather(*pending, return_exceptions=True)


# ── one dial ──────────────────────────────────────────────────────────────────


async def dial(db: AsyncIOMotorDatabase, household_id: str, *, now: datetime | None = None) -> str:
    """Place one call to a household. Returns our callId. Raises DialError."""
    now = now or utcnow()
    hh = await db.households.find_one({"_id": household_id})
    if hh is None:
        raise DialError(404, "household not found")
    if hh.get("reach") in BUSY:
        raise DialError(409, f"household is already {hh['reach']}")
    if not hh.get("simulated"):
        _check_cartesia()

    attempt = int(hh.get("dialAttempts") or 0) + 1
    call_id = new_id("call")
    claimed = await db.households.update_one(
        {"_id": household_id, "reach": {"$nin": list(BUSY)}},
        {
            "$set": {
                "reach": "ringing",
                "lastDialAt": now,
                "dialAttempts": attempt,
                "nextAttemptAt": None,
                "updatedAt": now,
            }
        },
    )
    if not claimed.modified_count:
        raise DialError(409, "household is already being called")
    await db.calls.insert_one(
        {
            "_id": call_id,
            "householdId": household_id,
            "direction": "outbound",
            "language": hh.get("language", "en"),
            "startedAt": now,
            "updatedAt": now,
            "outcome": None,
            "attempt": attempt,
            "simulated": bool(hh.get("simulated")),
            "turns": [],
        }
    )

    if hh.get("simulated"):
        _tasks[household_id] = asyncio.create_task(_standin(db, hh, call_id, attempt), name=f"standin-{household_id}")
    else:
        try:
            cartesia_id = await _cartesia_call(hh, call_id)
        except DialError:
            await no_answer(db, household_id, call_id, outcome="failed")
            raise
        await db.calls.update_one({"_id": call_id}, {"$set": {"cartesiaCallId": cartesia_id}})
    await audit.log(db, "call_dialed", f"attempt {attempt}", householdId=household_id, callId=call_id)
    return call_id


def _cartesia_ready() -> bool:
    s = get_settings()
    return bool(s.cartesia_api_key and s.cartesia_agent_id and s.cartesia_from_number_id)


def _check_cartesia() -> None:
    if not _cartesia_ready():
        raise DialError(
            503, "Cartesia is not configured (CARTESIA_API_KEY, CARTESIA_AGENT_ID, CARTESIA_FROM_NUMBER_ID)"
        )


async def _cartesia_call(hh: dict[str, Any], call_id: str, call_type: str = "outbound") -> str:
    """Cartesia outbound call. The Line agent reads householdId/callId from the dynamic variables
    and calls /agent/start with them when the resident picks up."""
    s = get_settings()
    body = {
        "from_number_id": s.cartesia_from_number_id,
        "agent_id": s.cartesia_agent_id,
        "ringing_timeout_seconds": RING_TIMEOUT_S,
        "outbound_calls": [
            {
                "to_number": hh["phone"],
                "dynamic_variables": {
                    "householdId": hh["_id"],
                    "callId": call_id,
                    "callType": call_type,  # read by voice/main.py (call_context)
                    "language": hh.get("language", "en"),
                },
            }
        ],
    }
    headers = {"X-API-Key": s.cartesia_api_key, "Cartesia-Version": CARTESIA_VERSION}
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.post(CARTESIA_URL, json=body, headers=headers)
            r.raise_for_status()
            entry = (r.json().get("calls") or [{}])[0]
    except httpx.HTTPError as e:
        raise DialError(502, f"Cartesia call failed: {e}") from e
    if "error" in entry or not entry.get("agent_call_id"):
        raise DialError(502, f"Cartesia refused the call: {entry.get('error')}")
    return entry["agent_call_id"]


def _roll(household_id: str, salt: str) -> float:
    """Deterministic 0..1 per household (same seed → same demo)."""
    return int(hashlib.sha1(f"{household_id}:{salt}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


async def _standin(db: AsyncIOMotorDatabase, hh: dict[str, Any], call_id: str, attempt: int) -> None:
    s = get_settings()
    try:
        never = _roll(hh["_id"], "never") < STANDIN_NEVER
        if never or _roll(hh["_id"], f"try{attempt}") < STANDIN_NO_ANSWER:
            await asyncio.sleep(min(2.0, s.standin_turn_delay_s * 3))  # it rings a little
            await no_answer(db, hh["_id"], call_id)
            return
        await standin.run_call(db, hh["_id"], call_id, turn_delay_s=s.standin_turn_delay_s)
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("stand-in call %s failed", call_id)
        await no_answer(db, hh["_id"], call_id, outcome="failed")


# ── the ladder ────────────────────────────────────────────────────────────────


async def no_answer(
    db: AsyncIOMotorDatabase,
    household_id: str,
    call_id: str | None = None,
    *,
    outcome: str = "no_answer",
    now: datetime | None = None,
) -> str:
    """Move one step down the ladder after an unanswered attempt. Returns the new reach."""
    now = now or utcnow()
    hh = await db.households.find_one({"_id": household_id}) or {}
    attempts = int(hh.get("dialAttempts") or 1)
    step = "retry_2" if attempts <= 1 else "retry_5" if attempts == 2 else "texted"
    nxt = now + timedelta(minutes=LADDER_MIN[step] * get_settings().reach_ladder_scale)
    await db.households.update_one(
        {"_id": household_id}, {"$set": {"reach": step, "nextAttemptAt": nxt, "updatedAt": now}}
    )
    if call_id:
        await db.calls.update_one({"_id": call_id}, {"$set": {"outcome": outcome, "endedAt": now, "updatedAt": now}})
    if step == "texted":
        # No SMS provider in the demo: the text is simulated and says so in the audit trail.
        await audit.log(db, "text_sent", "simulated text: please call back or leave now", householdId=household_id)
    await audit.log(db, "call_unanswered", f"{outcome} → {step}", householdId=household_id, callId=call_id)
    return step


async def sweep(db: AsyncIOMotorDatabase, now: datetime) -> None:
    """Real calls nobody picked up (the Line agent never called /agent/start) → no answer.
    Texted homes whose wait is over → door_check."""
    stale = now - timedelta(seconds=RING_TIMEOUT_S + ANSWER_GRACE_S)
    async for hh in db.households.find({"reach": "ringing", "simulated": {"$ne": True}}):
        if (aware(hh.get("lastDialAt")) or now) < stale:
            call = await db.calls.find_one({"householdId": hh["_id"], "outcome": None}, sort=[("startedAt", -1)])
            await no_answer(db, hh["_id"], call["_id"] if call else None, now=now)
    # Call records that never connected (no /agent/start) and whose household already moved on:
    # close them so the call floor doesn't show them as live forever.
    await db.calls.update_many(
        {"outcome": None, "startedAt": {"$lt": stale}},
        {"$set": {"outcome": "no_answer", "endedAt": now, "updatedAt": now}},
    )
    async for hh in db.households.find({"reach": "texted"}):
        due = aware(hh.get("nextAttemptAt"))
        if due is not None and due <= now:
            await db.households.update_one(
                {"_id": hh["_id"], "reach": "texted"},
                {"$set": {"reach": "door_check", "nextAttemptAt": None, "updatedAt": now}},
            )
            await audit.log(db, "door_check", "no answer after 3 calls and a text", householdId=hh["_id"])


# ── the queue ─────────────────────────────────────────────────────────────────


async def _voice_standins_on(db: AsyncIOMotorDatabase) -> bool:
    doc = await db.simControl.find_one({"_id": "sim"}) or {}
    return bool((doc.get("standIns") or {}).get("voice", False))


def _order(hh: dict[str, Any]) -> tuple:
    """Highest priority first: retries before first calls, then earliest deadline."""
    deadline = aware(hh.get("deadlineAt"))
    return (hh.get("reach") == "not_called", deadline is None, deadline.timestamp() if deadline else 0.0)


async def due(db: AsyncIOMotorDatabase, now: datetime) -> list[dict[str, Any]]:
    """Households to call now, in order."""
    zones = [z["_id"] async for z in db.zones.find({"status": {"$in": list(ACTIVE_ZONE_STATUSES)}}, {"_id": 1})]
    if not zones:
        return []
    q: dict[str, Any] = {"zoneId": {"$in": zones}, "reach": {"$in": ["not_called", "retry_2", "retry_5"]}}
    standins, real = await _voice_standins_on(db), _cartesia_ready()
    if not (standins or real):
        return []
    if not standins:
        q["simulated"] = {"$ne": True}
    elif not real:  # no phone line configured: don't spin on real homes, they wait for Cartesia
        q["simulated"] = True
    fields = {"reach": 1, "deadlineAt": 1, "nextAttemptAt": 1, "simulated": 1}
    rows = [h async for h in db.households.find(q, fields)]
    ready = [h for h in rows if h["reach"] == "not_called" or (aware(h.get("nextAttemptAt")) or now) <= now]
    return sorted(ready, key=_order)


class Pacer:
    """At most `rate` starts per second, separately for real phones and stand-ins."""

    def __init__(self) -> None:
        self.last: dict[bool, float] = {True: 0.0, False: 0.0}

    def allow(self, simulated: bool, rate: float) -> bool:
        now = time.monotonic()
        if rate <= 0 or now - self.last[simulated] < 1.0 / rate:
            return False
        self.last[simulated] = now
        return True


async def tick(db: AsyncIOMotorDatabase, pacer: Pacer, now: datetime | None = None) -> int:
    """One pass of the dialer. Returns how many calls were placed."""
    s = get_settings()
    now = now or utcnow()
    await sweep(db, now)
    placed = 0
    for hh in await due(db, now):
        sim = bool(hh.get("simulated"))
        if sim and running() >= s.standin_concurrency:
            continue
        if not pacer.allow(sim, s.standin_rate_per_s if sim else s.dial_rate_per_s):
            continue
        try:
            await dial(db, hh["_id"], now=now)
            placed += 1
        except DialError as e:
            log.warning("dial %s skipped: %s", hh["_id"], e)
    return placed


async def run(db: AsyncIOMotorDatabase, every_s: float = 0.25) -> None:
    pacer = Pacer()
    while True:
        try:
            await tick(db, pacer)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("dialer tick failed")
        await asyncio.sleep(every_s)
