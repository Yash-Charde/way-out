from typing import Any

from fastapi import HTTPException, status


def out(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Mongo `_id` → `id` on the wire."""
    if doc is None:
        return None
    return {"id": doc["_id"], **{k: v for k, v in doc.items() if k != "_id"}}


def not_yet(feature: str) -> HTTPException:
    """Endpoint is in the contract but not built yet. Replace the raise with the real thing."""
    return HTTPException(status.HTTP_501_NOT_IMPLEMENTED, f"not implemented yet: {feature}")
