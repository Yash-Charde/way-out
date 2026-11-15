"""Way Out voice agent: a thin client. Our API chooses every sentence; this file only relays.

  call starts      → POST /agent/start  → speak say[]
  resident speaks  → POST /agent/turn   → speak say[] (exactly as returned), hang up when done

No LLM runs here. The API does interpretation, the state machine, templates and the honesty guard,
so what a resident hears on the phone is exactly what the tests and evals check.

Call context comes from the outbound call's dynamic variables (householdId, callId, callType,
language), which the dialer and callback worker set. An inbound call without them uses
DEFAULT_HOUSEHOLD_ID (the demo household).

Env (cartesia env set): PUBLIC_API_URL, INTERNAL_TOKEN, DEFAULT_HOUSEHOLD_ID (optional).
"""

import logging
import os
from collections.abc import AsyncIterator
from typing import Any

from line.events import AgentEndCall, AgentSendText, CallStarted, UserTextSent, UserTurnEnded
from line.voice_agent_app import AgentEnv, CallRequest, VoiceAgentApp

from client import AgentClient

log = logging.getLogger("wayout.voice")

# Said only if our API can't be reached. Fixed text, same safety advice as the status templates.
FALLBACK = {
    "en": "I'm sorry, I'm having trouble on my end. If you can leave safely, leave now. "
    "If fire reaches your home, call 911.",
    "es": "Lo siento, tengo un problema técnico. Si puede salir de forma segura, salga ahora. "
    "Si el fuego llega a su casa, llame al 911.",
}


def call_context(req: CallRequest) -> dict[str, str]:
    """What we know about the call. Cartesia doesn't pass our dynamic variables to SDK agents, so the
    API usually works out the household from `cartesiaCallId` (stored by our dialer) instead."""
    md: dict[str, Any] = dict(req.metadata or {})
    for nested in ("dynamic_variables", "dynamicVariables", "variables"):
        if isinstance(md.get(nested), dict):
            md = {**md, **md[nested]}
    return {
        "householdId": str(md.get("householdId") or os.environ.get("DEFAULT_HOUSEHOLD_ID", "")),
        "callId": str(md.get("callId") or f"call_{req.call_id}"),
        "callType": str(md.get("callType") or "inbound"),
        "language": str(md.get("language") or "en"),
        "cartesiaCallId": str(req.agent_call_id or ""),
        "callerPhone": str(req.from_ or ""),
    }


class WayOutAgent:
    def __init__(self, ctx: dict[str, str], client: AgentClient):
        self.ctx = ctx
        self.client = client
        self.lang = ctx["language"] if ctx["language"] in FALLBACK else "en"
        self.started = False

    async def process(self, env: Any, event: Any) -> AsyncIterator[Any]:
        # People often say "Hello?" the moment they pick up. The SDK cancels the greeting when they
        # start talking, so the first turn may arrive before the call was started: start it then.
        if isinstance(event, UserTurnEnded) and not self.started:
            event = CallStarted()
        if isinstance(event, CallStarted):
            if self.started:
                return
            try:
                out = await self.client.start(
                    self.ctx["householdId"],
                    self.ctx["callType"],
                    self.ctx["callId"],
                    cartesia_call_id=self.ctx["cartesiaCallId"] or None,
                    caller_phone=self.ctx["callerPhone"] or None,
                )
            except Exception:
                log.exception("agent/start failed")
                yield AgentSendText(text=FALLBACK[self.lang])
                yield AgentEndCall()
                return
            # The API tells us which call and household this really is; use those from now on.
            for key in ("callId", "householdId", "callType"):
                if out.get(key):
                    self.ctx[key] = out[key]
            self.started = True
            for line in out.get("say", []):
                yield AgentSendText(text=line)
            return

        if isinstance(event, UserTurnEnded):
            text = " ".join(c.content for c in event.content if isinstance(c, UserTextSent)).strip()
            if not text:
                return
            try:
                out = await self.client.turn(self.ctx["callId"], self.ctx["householdId"], text, self.lang)
            except Exception:
                log.exception("agent/turn failed")
                yield AgentSendText(text=FALLBACK[self.lang])
                return
            for line in out.get("say", []):
                yield AgentSendText(text=line)
            if out.get("done"):
                yield AgentEndCall()


async def get_agent(env: AgentEnv, call_request: CallRequest) -> WayOutAgent:
    ctx = call_context(call_request)
    log.info("call %s household=%s type=%s", ctx["callId"], ctx["householdId"], ctx["callType"])
    return WayOutAgent(ctx, AgentClient())


app = VoiceAgentApp(get_agent=get_agent)

if __name__ == "__main__":
    app.run()
