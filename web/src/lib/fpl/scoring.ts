import type { Player, RiskMode, ScoredPlayer } from "./types";

export function minutesFactor(player: Player): number {
  const chance = player.chance_next ?? 100;
  const status = player.status || "a";
  if (["u", "s", "n"].includes(status)) return 0.05;
  if (status === "i") return Math.max(0.1, (chance / 100) * 0.5);
  if (status === "d") return Math.max(0.2, chance / 100);
  return Math.max(0.15, Math.min(1, chance / 100));
}

function fixtureFactor(avgFdr: number): number {
  return Math.max(0.7, Math.min(1.2, 1.3 - (avgFdr - 1) * 0.12));
}

function underlyingBoost(player: Player): number {
  return Math.min(0.35, (player.xgi90 || 0) * 0.25);
}

function setPieceBoost(player: Player): number {
  let boost = 0;
  if (player.penalties_order === 1) boost += 0.12;
  else if (player.penalties_order === 2 || player.penalties_order === 3)
    boost += 0.04;
  if (player.corners_order === 1) boost += 0.05;
  if (player.direct_freekicks_order === 1) boost += 0.03;
  return boost;
}

function flags(player: Player, mf: number): string[] {
  const out: string[] = [];
  if (mf < 0.5) out.push("minutes-risk");
  if (player.news) out.push("news");
  if (player.status !== "a") out.push(`status:${player.status}`);
  if ((player.avg_fdr_next3 || 3) >= 4.2) out.push("tough-fixtures");
  if (player.penalties_order === 1) out.push("pens");
  return out;
}

export function scorePlayer(
  player: Player,
  opts: { horizon?: number; risk?: RiskMode } = {},
): ScoredPlayer {
  const horizon = opts.horizon ?? 5;
  const risk = opts.risk ?? "balanced";
  const mf = minutesFactor(player);
  const fdr =
    horizon <= 3 ? player.avg_fdr_next3 : player.avg_fdr_next5 || player.avg_fdr_next3;
  const ff = fixtureFactor(fdr || 3);
  const ep = player.ep_next || player.ep_this || 0;
  const form = player.form || 0;
  let raw = (ep * 0.7 + form * 0.3) * mf * ff;
  raw *= 1 + underlyingBoost(player) + setPieceBoost(player);
  if (player.position === "DEF" || player.position === "GKP") {
    raw *= 1 + Math.min(0.1, (player.defensive_contribution_per_90 || 0) * 0.02);
  }
  const ownership = player.ownership || 0;
  const differential = ownership < 8 && raw >= 3.5 && mf >= 0.75;
  const template = ownership >= 25;
  if (risk === "safe") {
    raw *= 0.95 + Math.min(0.1, ownership / 500);
    raw *= 0.9 + 0.1 * mf;
  } else if (risk === "aggressive") {
    if (differential) raw *= 1.08;
    if (ownership < 5 && mf >= 0.8) raw *= 1.04;
  }
  const value = raw / Math.max(player.cost || 4, 3.5);
  return {
    ...player,
    score: Math.round(raw * 1000) / 1000,
    value_score: Math.round(value * 1000) / 1000,
    minutes_factor: Math.round(mf * 1000) / 1000,
    fixture_factor: Math.round(ff * 1000) / 1000,
    is_differential: differential,
    is_template: template,
    risk_flags: flags(player, mf),
  };
}

export function rankPlayers(
  players: Player[],
  opts: {
    position?: string;
    horizon?: number;
    risk?: RiskMode;
    minMinutes?: number;
    limit?: number;
  } = {},
): ScoredPlayer[] {
  const {
    position,
    horizon = 5,
    risk = "balanced",
    minMinutes = 0,
    limit = 20,
  } = opts;
  return players
    .filter((p) => !position || p.position === position)
    .filter((p) => p.can_select !== false)
    .filter((p) => !["u", "s"].includes(p.status))
    .filter((p) => !minMinutes || (p.minutes || 0) >= minMinutes)
    .map((p) => scorePlayer(p, { horizon, risk }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function captainShortlist(
  squad: Player[],
  opts: { horizon?: number; risk?: RiskMode; limit?: number } = {},
): ScoredPlayer[] {
  const { horizon = 3, risk = "balanced", limit = 5 } = opts;
  const starters = squad.filter(
    (p) => (p.multiplier || 0) > 0 || (p.position_slot || 99) <= 11,
  );
  const pool = starters.length ? starters : squad;
  return pool
    .map((p) => {
      const s = scorePlayer(p, { horizon, risk });
      if (s.minutes_factor < 0.75) {
        s.score *= 0.5;
        s.risk_flags = [...s.risk_flags, "low-captain-minutes"];
      }
      s.eo_proxy = s.ownership || 0;
      return s;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function transferReason(
  out: ScoredPlayer,
  inn: ScoredPlayer,
  delta: number,
  hit: number,
  kind?: "injury" | "dead-bench" | "fixtures",
): string {
  const bits: string[] = [];
  if (kind === "dead-bench") {
    bits.push("dead bench / no auto-sub cover");
  }
  if ((out.minutes_factor || 1) < 0.6) bits.push(`${out.web_name} minutes risk`);
  if ((out.avg_fdr_next3 || 3) - (inn.avg_fdr_next3 || 3) >= 0.8)
    bits.push("fixture swing");
  if ((inn.xgi90 || 0) > (out.xgi90 || 0) + 0.15)
    bits.push("stronger underlying xGI/90");
  if ((inn.minutes_factor || 0) >= 0.85 && (inn.starts || 0) >= 2) {
    bits.push("replacement likely starts");
  }
  if (inn.is_differential) bits.push("differential upside");
  if (hit) bits.push(`requires -${hit}`);
  bits.push(`score delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`);
  return bits.join("; ");
}

function isDeadBench(p: ScoredPlayer): boolean {
  const onBenchSlot = (p.position_slot || 0) > 11;
  const barelyPlays =
    (p.minutes || 0) < 90 ||
    (p.starts || 0) <= 1 ||
    (p.ep_next || 0) < 1.2;
  const unavailable = (p.minutes_factor || 1) < 0.45;
  // Backup GKs who never play are classic dead wood for outfield auto-subs
  // but we still need 2 GKs — only flag extreme cases with near-zero involvement
  if (p.position === "GKP") {
    return (p.minutes || 0) === 0 && (p.ep_next || 0) < 0.5 && onBenchSlot;
  }
  return barelyPlays || unavailable || (onBenchSlot && (p.score || 0) < 2.2);
}

export function transferIdeas(
  catalogPlayers: Player[],
  squad: Player[],
  opts: {
    bank?: number;
    freeTransfers?: number;
    horizon?: number;
    risk?: RiskMode;
    limit?: number;
  } = {},
) {
  const {
    bank = 0,
    freeTransfers = 1,
    horizon = 5,
    risk = "balanced",
    limit = 8,
  } = opts;
  const owned = new Set(squad.map((p) => p.id));
  const squadScored = squad
    .map((p) => scorePlayer(p, { horizon, risk }))
    .sort((a, b) => a.score - b.score);

  const deadBench = squadScored.filter(isDeadBench);
  const injuryRisk = squadScored.filter(
    (p) =>
      p.minutes_factor < 0.6 || (p.risk_flags || []).includes("news"),
  );
  const fixturePain = squadScored.filter((p) =>
    (p.risk_flags || []).includes("tough-fixtures"),
  );

  // Priority: non-playing bench first (auto-sub insurance), then injured/doubtful, then fixtures
  const weakMap = new Map<number, ScoredPlayer>();
  for (const p of [...deadBench, ...injuryRisk, ...fixturePain]) {
    if (!weakMap.has(p.id)) weakMap.set(p.id, p);
  }
  let weak = [...weakMap.values()].sort((a, b) => a.score - b.score);
  if (!weak.length) weak = squadScored.slice(0, 3);

  const market = rankPlayers(
    catalogPlayers.filter((p) => !owned.has(p.id)),
    { horizon, risk, minMinutes: 90, limit: 100 },
  );

  // Prefer players who actually start — critical when fixing bench coverage
  const startableMarket = market.filter(
    (c) =>
      (c.minutes_factor || 0) >= 0.75 &&
      ((c.starts || 0) >= 2 || (c.minutes || 0) >= 180),
  );

  const ideas = [];
  for (const out of weak) {
    const kind: "injury" | "dead-bench" | "fixtures" = deadBench.some(
      (d) => d.id === out.id,
    )
      ? "dead-bench"
      : injuryRisk.some((d) => d.id === out.id)
        ? "injury"
        : "fixtures";
    const budget = bank + (out.selling_price || out.cost || 0);
    const pool = kind === "dead-bench" ? startableMarket : market;
    const candidates = pool
      .filter(
        (c) =>
          c.position === out.position &&
          (c.cost || 99) <= budget + 0.05 &&
          c.score > out.score + 0.35,
      )
      .slice(0, 6);
    for (const inn of candidates) {
      const delta = Math.round((inn.score - out.score) * 1000) / 1000;
      const hitCost = freeTransfers >= 1 ? 0 : 4;
      // Dead-bench upgrades are almost always worth a free transfer even with modest delta
      const worthwhile =
        kind === "dead-bench"
          ? delta > hitCost * 0.5 + 0.25
          : delta > hitCost * 0.85 + 0.5;
      ideas.push({
        out,
        in: inn,
        delta,
        hit_cost: hitCost,
        worthwhile,
        kind,
        reason: transferReason(out, inn, delta, hitCost, kind),
      });
    }
  }
  ideas.sort(
    (a, b) =>
      Number(b.worthwhile) - Number(a.worthwhile) ||
      (a.kind === "dead-bench" ? 0 : 1) - (b.kind === "dead-bench" ? 0 : 1) ||
      b.delta - a.delta,
  );
  const seen = new Set<string>();
  const unique = [];
  for (const idea of ideas) {
    const key = `${idea.out.id}-${idea.in.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(idea);
    if (unique.length >= limit) break;
  }
  return {
    weak_links: weak.slice(0, 5),
    dead_bench: deadBench.slice(0, 6),
    ideas: unique,
    hold_recommendation: !unique.slice(0, 3).some((i) => i.worthwhile),
  };
}

/** Legal FPL outfield shapes: DEF-MID-FWD (sums to 10). */
const FORMATIONS: [number, number, number][] = [
  [3, 4, 3],
  [3, 5, 2],
  [4, 4, 2],
  [4, 3, 3],
  [4, 5, 1],
  [5, 3, 2],
  [5, 4, 1],
  [5, 2, 3],
];

export function suggestLineup(
  squad: Player[],
  opts: { horizon?: number; risk?: RiskMode } = {},
): {
  formation: string;
  xi: ScoredPlayer[];
  bench: ScoredPlayer[];
  notes: string[];
} {
  const { horizon = 3, risk = "balanced" } = opts;
  const scored = squad.map((p) => scorePlayer(p, { horizon, risk }));
  const byPos = {
    GKP: scored.filter((p) => p.position === "GKP").sort((a, b) => b.score - a.score),
    DEF: scored.filter((p) => p.position === "DEF").sort((a, b) => b.score - a.score),
    MID: scored.filter((p) => p.position === "MID").sort((a, b) => b.score - a.score),
    FWD: scored.filter((p) => p.position === "FWD").sort((a, b) => b.score - a.score),
  };

  const gk = byPos.GKP[0];
  if (!gk) {
    return {
      formation: "—",
      xi: [],
      bench: scored,
      notes: ["No goalkeeper found in squad."],
    };
  }

  let best: {
    formation: string;
    xi: ScoredPlayer[];
    total: number;
  } | null = null;

  for (const [d, m, f] of FORMATIONS) {
    if (byPos.DEF.length < d || byPos.MID.length < m || byPos.FWD.length < f) continue;
    const xi = [
      gk,
      ...byPos.DEF.slice(0, d),
      ...byPos.MID.slice(0, m),
      ...byPos.FWD.slice(0, f),
    ];
    if (xi.length !== 11) continue;
    const total = xi.reduce((s, p) => s + p.score, 0);
    const formation = `${d}-${m}-${f}`;
    if (!best || total > best.total) best = { formation, xi, total };
  }

  if (!best) {
    // Fallback: best GK + top 10 outfield ignoring rare shortages
    const outfield = [...byPos.DEF, ...byPos.MID, ...byPos.FWD].sort(
      (a, b) => b.score - a.score,
    );
    const xi = [gk, ...outfield.slice(0, 10)];
    best = { formation: "custom", xi, total: xi.reduce((s, p) => s + p.score, 0) };
  }

  const xiIds = new Set(best.xi.map((p) => p.id));
  const bench = scored
    .filter((p) => !xiIds.has(p.id))
    .sort((a, b) => {
      // Outfield before backup GK for auto-sub order
      const ag = a.position === "GKP" ? 1 : 0;
      const bg = b.position === "GKP" ? 1 : 0;
      return ag - bg || b.score - a.score;
    });

  const notes: string[] = [];
  const riskyStarters = best.xi.filter((p) => p.minutes_factor < 0.75);
  if (riskyStarters.length) {
    notes.push(
      `Minutes risk in XI: ${riskyStarters.map((p) => p.web_name).join(", ")} — confirm team news before lock.`,
    );
  }
  const benchUpside = bench.find(
    (p) => p.position !== "GKP" && p.score > (best!.xi.at(-1)?.score ?? 0) - 0.3,
  );
  if (benchUpside && !xiIds.has(benchUpside.id)) {
    const weakest = [...best.xi]
      .filter((p) => p.position === benchUpside.position)
      .sort((a, b) => a.score - b.score)[0];
    if (weakest && benchUpside.score > weakest.score + 0.35) {
      notes.push(
        `Close call: ${benchUpside.web_name} (bench) scores above ${weakest.web_name} — swap if news is clean.`,
      );
    }
  }
  notes.push(
    "Bench order is set for auto-subs (best outfield first, backup GK last).",
  );

  // Order XI: GK, DEF, MID, FWD for readability
  const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 } as Record<string, number>;
  best.xi.sort(
    (a, b) =>
      (order[a.position] ?? 9) - (order[b.position] ?? 9) || b.score - a.score,
  );

  return {
    formation: best.formation,
    xi: best.xi,
    bench,
    notes,
  };
}
