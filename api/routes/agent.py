"""POST /agent/start, POST /agent/turn. Bearer INTERNAL_TOKEN."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.agent import session
from api.core.auth import require_internal_token
from api.core.db import get_db
from api.core.util import new_id

router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(require_internal_token)])


class StartBody(BaseModel):
    householdId: str | None = None
    callType: Literal["outbound", "callback", "inbound"] = "inbound"
    callId: str | None = None
    # Cartesia doesn't hand our dynamic variables to SDK agents, so the voice agent also sends what
    # it does know: Cartesia's own call id (the dialer stored it) and the phone numbers.
    cartesiaCallId: str | None = None
    callerPhone: str | None = None  # inbound: who is calling us


class TurnBody(BaseModel):
    callId: str
    householdId: str
    text: str = Field(max_length=2000)
    language: Literal["en", "es"] = "en"


@router.post("/start")
async def agent_start(body: StartBody) -> dict:
    """→ {say: [str], stage, callId, householdId, callType}

    Which call is this? In order: the call we dialed (matched by Cartesia's call id), then the
    household with the caller's number (inbound), then the ids the voice agent sent.
    """
    db = get_db()
    call_id, household_id, call_type = body.callId, body.householdId, body.callType
    if body.cartesiaCallId:
        ours = await db.calls.find_one({"cartesiaCallId": body.cartesiaCallId})
        if ours:
            call_id, household_id, call_type = ours["_id"], ours["householdId"], ours.get("direction", "outbound")
    if (not household_id or not call_id) and body.callerPhone:
        hh = await db.households.find_one({"phone": body.callerPhone, "simulated": {"$ne": True}})
        if hh:
            household_id, call_type = hh["_id"], "inbound"
            call_id = call_id or f"call_in_{body.cartesiaCallId or new_id('c')}"
    if not household_id or not call_id:
        raise HTTPException(404, "can't tell which household this call is for")
    out = await session.start(db, household_id, call_type, call_id)
    return {**out, "callId": call_id, "householdId": household_id, "callType": call_type}


@router.post("/turn")
async def agent_turn(body: TurnBody) -> dict:
    """→ {say: [str], stage, done, record, requestStatus}

    interpreter (api/agent/interpreter.py) → state machine (flow.py) → templates.py → honesty.py
    """
    return await session.turn(get_db(), body.callId, body.householdId, body.text, body.language)
