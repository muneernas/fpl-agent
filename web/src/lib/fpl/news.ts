import type { NewsFlag, Player } from "./types";

const STATUS_LABEL: Record<string, string> = {
  a: "available",
  d: "doubtful",
  i: "injured",
  s: "suspended",
  u: "unavailable",
  n: "not-in-squad / left club",
};

function ageHours(newsAdded?: string | null): number | null {
  if (!newsAdded) return null;
  const ts = Date.parse(newsAdded);
  if (Number.isNaN(ts)) return null;
  return (Date.now() - ts) / 36e5;
}

export function squadAvailability(squad: Player[]): NewsFlag[] {
  return squad
    .filter((p) => {
      const status = p.status || "a";
      const chance = p.chance_next;
      return status !== "a" || Boolean(p.news) || (chance != null && chance < 100);
    })
    .map((p) => ({
      web_name: p.web_name,
      team: p.team,
      position: p.position,
      status: p.status,
      status_label: STATUS_LABEL[p.status] || p.status,
      chance_next: p.chance_next,
      news: p.news || "",
      news_added: p.news_added,
      age_hours: ageHours(p.news_added),
      scout_news_link: p.scout_news_link || "",
    }))
    .sort(
      (a, b) =>
        (a.status === "a" ? 1 : 0) - (b.status === "a" ? 1 : 0) ||
        (a.chance_next ?? 100) - (b.chance_next ?? 100),
    );
}

export function injuryFeed(
  players: Player[],
  opts: { ownedIds?: Set<number>; maxAgeHours?: number | null; limit?: number } = {},
): NewsFlag[] {
  const { ownedIds, maxAgeHours = 96, limit = 30 } = opts;
  const rows: NewsFlag[] = [];
  for (const p of players) {
    const status = p.status || "a";
    const news = (p.news || "").trim();
    const age = ageHours(p.news_added);
    if (status === "a" && !news) continue;
    if (
      status === "a" &&
      maxAgeHours != null &&
      (age == null || age > maxAgeHours)
    )
      continue;
    rows.push({
      id: p.id,
      web_name: p.web_name,
      team: p.team,
      position: p.position,
      status,
      status_label: STATUS_LABEL[status] || status,
      chance_next: p.chance_next,
      news,
      news_added: p.news_added,
      age_hours: age == null ? null : Math.round(age * 10) / 10,
      scout_news_link: p.scout_news_link || "",
      owned: Boolean(ownedIds?.has(p.id)),
    });
  }
  const severity: Record<string, number> = {
    i: 0,
    s: 1,
    u: 1,
    n: 2,
    d: 3,
    a: 4,
  };
  rows.sort(
    (a, b) =>
      (a.owned ? 0 : 1) - (b.owned ? 0 : 1) ||
      (severity[a.status] ?? 5) - (severity[b.status] ?? 5) ||
      (a.age_hours ?? 9999) - (b.age_hours ?? 9999),
  );
  return rows.slice(0, limit);
}
