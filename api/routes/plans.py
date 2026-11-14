"""POST /plans/solve, GET /plans/latest (Yash: D2-04)."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from api.core.db import get_db
from api.dispatch import loop
from api.routes._util import out

router = APIRouter(prefix="/plans", tags=["plans"])


class SolveBody(BaseModel):
    solver: Literal["greedy", "ortools"] = "greedy"


@router.post("/solve")
async def solve(body: SolveBody | None = None) -> dict:
    """Plan once now. OR-Tools is P1 (D2-09); until it lands every solve is greedy (`requested` says what
    was asked for)."""
    return await loop.solve_once(get_db(), (body or SolveBody()).solver)


@router.get("/latest")
async def latest() -> dict:
    """The newest plan + every live offer the dispatcher can act on (proposed and offered, any version)."""
    db = get_db()
    plan = await db.plans.find_one(sort=[("version", -1)])
    rows = db.assignments.find({"status": {"$in": ["proposed", "offered"]}}).sort("etaMinutes", 1)
    return {"plan": out(plan), "assignments": [out(a) async for a in rows]}
