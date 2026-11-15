# voice/ — Cartesia Line agent

Thin client: `main.py` relays every caller turn to the API and speaks back `say[]` exactly. No LLM runs
here; interpretation, the state machine, templates and the honesty guard all live in `api/agent/`.

| | |
|---|---|
| Cartesia agent | `wayout-dev` · `agent_daiGsFjcGCn25NpH1UML4T` |
| Phone number | +1 (218) 595-2687 · `ap_DNxmUfDhdyez4BwaCSTCCU` (free Cartesia number, US calls only) |
| Call context | outbound calls pass `householdId`, `callId`, `callType`, `language` as dynamic variables (set by `api/agent/dialer.py` and `callbacks.py`). Inbound calls use `DEFAULT_HOUSEHOLD_ID` |
| If the API is down | the agent says a fixed safety line ("If you can leave safely, leave now. If fire reaches your home, call 911.") and hangs up |

```bash
curl -fsSL https://cartesia.sh | sh             # CLI, once
cartesia auth login <CARTESIA_API_KEY>
cd voice && uv sync
cartesia env set --agent-id agent_daiGsFjcGCn25NpH1UML4T \
  PUBLIC_API_URL=https://api-dev.<domain> INTERNAL_TOKEN=<same as the API> DEFAULT_HOUSEHOLD_ID=<hh id>
cartesia deploy --agent-id agent_daiGsFjcGCn25NpH1UML4T .
cartesia status agent_daiGsFjcGCn25NpH1UML4T
```

Test without a phone: run the API, then drive `main.WayOutAgent` with `CallStarted` / `UserTurnEnded`
events, or `cartesia chat 8000` against `PORT=8000 uv run python main.py`.

Note: Cartesia stops hosting Line SDK code on Dec 1, 2026. After that, run `main.py` on the API server and
`cartesia connect --url ...` (self-hosted). The code doesn't change.
