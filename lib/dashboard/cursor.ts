/**
 * Opaque cursor encoding for the dashboard's "load more" endpoints — base64
 * of a small JSON tuple, never inspected by clients. Kept in one place so
 * both `/api/scrape/runs` and `/api/listings` encode/decode identically.
 */
export function encodeCursor(cursor: unknown): string | null {
  return cursor ? Buffer.from(JSON.stringify(cursor)).toString("base64") : null;
}

export function decodeCursor<T>(param: string | null): T | undefined {
  if (!param) return undefined;
  return JSON.parse(Buffer.from(param, "base64").toString("utf-8")) as T;
}
