/** Thin REST client for the Way Out API (CONTRACT §2). */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new ApiError(res.status, detail?.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

type Doc = { id: string } & Record<string, unknown>;

export const api = {
  health: () => call<{ ok: boolean; env: string; version: string; gitSha: string }>("GET", "/health"),
  households: (zoneId?: string) =>
    call<Doc[]>("GET", `/households${zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : ""}`),
  openRequests: () => call<Doc[]>("GET", "/requests/open"),
  vehicles: () => call<Doc[]>("GET", "/vehicles"),
  hazards: () => call<{ hazards: Doc[]; closures: Doc[] }>("GET", "/hazards"),
  latestPlan: () => call<{ plan: Doc | null; assignments: Doc[] }>("GET", "/plans/latest"),

  approve: (id: string) => call<Doc>("POST", `/assignments/${id}/approve`),
  accept: (id: string) => call<{ result: "accepted" | "changed"; assignment: Doc | null }>(
    "POST",
    `/assignments/${id}/accept`,
  ),
  decline: (id: string) => call<Doc>("POST", `/assignments/${id}/decline`),
  cancel: (id: string) => call<Doc>("POST", `/assignments/${id}/cancel`),
  /** en_route (+etaMinutes, repeat to update) → arrived ("Picked up") → completed (at shelter). */
  progress: (id: string, status: "en_route" | "arrived" | "completed", etaMinutes?: number) =>
    call<Doc>("POST", `/assignments/${id}/progress`, { status, etaMinutes }),
  /** No ride needed any more (resident left, duplicate). Withdraws offers; no resident callback. */
  closeRequest: (id: string, reason: "resident_left" | "duplicate" | "dispatcher") =>
    call<Doc>("POST", `/requests/${id}/close`, { reason }),

  position: (id: string, p: { lon: number; lat: number; heading?: number; speedMps?: number }) =>
    call<{ ok: true }>("POST", `/vehicles/${id}/position`, p),
  safety: (id: string, s: { state: "ok" | "check" | "man_down" | "sos"; lon?: number; lat?: number }) =>
    call<{ ok: true }>("POST", `/vehicles/${id}/safety`, s),
  closeRoad: (coordinates: [number, number][], source: "manual" | "hazard" | "sim" = "manual") =>
    call<Doc>("POST", "/roads/closures", { geometry: { type: "LineString", coordinates }, source }),
};
