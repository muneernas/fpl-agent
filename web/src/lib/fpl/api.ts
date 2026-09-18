const BASE = "https://fantasy.premierleague.com/api";

const headers = {
  "User-Agent":
    "NEXTGW/0.1 (personal FPL advisor; https://github.com/local/fpl-agent)",
  Accept: "application/json",
};

async function getJson<T>(path: string, fresh = false): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...(fresh
      ? { cache: "no-store" as const }
      : { next: { revalidate: 300 } }),
  });
  if (!res.ok) {
    throw new Error(`FPL API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchBootstrap(fresh = true) {
  return getJson<Record<string, unknown>>("/bootstrap-static/", fresh);
}

export function fetchFixtures(event?: number, fresh = true) {
  const path =
    event != null ? `/fixtures/?event=${event}` : "/fixtures/";
  return getJson<Record<string, unknown>[]>(path, fresh);
}

export function fetchEntry(entryId: number) {
  return getJson<Record<string, unknown>>(`/entry/${entryId}/`, true);
}

export function fetchEntryHistory(entryId: number) {
  return getJson<Record<string, unknown>>(`/entry/${entryId}/history/`, true);
}

export function fetchEntryPicks(entryId: number, event: number) {
  return getJson<Record<string, unknown>>(
    `/entry/${entryId}/event/${event}/picks/`,
    true,
  );
}
