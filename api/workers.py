"""Background loops that live inside the API process.

Owned here: offer expiry and change-stream watchers. Other workers (dialer, callback caller,
solver loop, hazard clock) are started by their owners from this same place, e.g.:

    tasks.append(asyncio.create_task(dispatch.loop.run(db)))   # D2-04
"""

import asyncio
import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

from api import assignments
from api.dispatch import loop as dispatch_loop
from api.live import WATCHED, watch_collection

log = logging.getLogger(__name__)


async def expiry_loop(db: AsyncIOMotorDatabase, every_s: float = 5) -> None:
    while True:
        try:
            n = await assignments.expire_offers(db)
            if n:
                log.info("expired %d offers", n)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("expiry loop error")
        await asyncio.sleep(every_s)


def start(db: AsyncIOMotorDatabase) -> list[asyncio.Task]:
    tasks = [asyncio.create_task(expiry_loop(db), name="offer-expiry")]
    tasks += [asyncio.create_task(watch_collection(db, c), name=f"watch-{c}") for c in WATCHED]
    tasks.append(asyncio.create_task(dispatch_loop.run(db), name="solver-loop"))  # D2-04
    return tasks


async def stop(tasks: list[asyncio.Task]) -> None:
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
