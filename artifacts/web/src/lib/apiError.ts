/**
 * Parse a non-OK Response into a thrown Error whose `.message` is the
 * server's `error` field (or a sensible fallback). Use after `await fetch(...)`
 * to surface API errors — including the period-lock 409 — to toast handlers.
 */
export async function throwOnApiError(res: Response): Promise<void> {
  if (res.ok) return;
  let body: any = null;
  try { body = await res.clone().json(); } catch { /* not json */ }
  const message =
    body?.error ||
    body?.message ||
    `Request failed (${res.status})`;
  const err = new Error(message) as Error & { status?: number; body?: any };
  err.status = res.status;
  err.body = body;
  throw err;
}

/** Pull a user-friendly message out of any thrown value. */
export function getErrorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (!e) return fallback;
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  const anyE = e as any;
  if (anyE?.body?.error) return String(anyE.body.error);
  if (anyE?.error) return String(anyE.error);
  return fallback;
}
