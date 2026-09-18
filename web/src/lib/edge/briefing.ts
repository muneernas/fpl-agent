import { loadSquad, buildCatalog } from "@/lib/fpl/catalog";
import { scorePlayer, captainShortlist, suggestLineup } from "@/lib/fpl/scoring";
import type { AnalyzeResult, Player, ScoredPlayer } from "@/lib/fpl/types";
import type { EdgeConfig } from "./config";

export type RivalSnapshot = {
  label: string;
  entry_id: number;
  name: string;
  team_name: string;
  overall_rank?: number;
  owned_ids: number[];
  owned_names: string[];
  captain?: string;
};

export type EdgeBriefing = {
  you: AnalyzeResult;
  rivals: RivalSnapshot[];
  vs_rivals: {
    your_unique: ScoredPlayer[];
    rival_template: { web_name: string; owned_by: string[]; ownership: number }[];
    differential_captain_ideas: {
      player: string;
      reason: string;
      rivals_without: string[];
    }[];
    transfer_pressure: string[];
  };
  strategy_notes: string[];
};

function ownershipCount(
  playerId: number,
  rivals: RivalSnapshot[],
): { count: number; labels: string[] } {
  const labels = rivals
    .filter((r) => r.owned_ids.includes(playerId))
    .map((r) => r.label);
  return { count: labels.length, labels };
}

export async function buildEdgeBriefing(
  cfg: EdgeConfig,
  base: AnalyzeResult,
  yourPicks: Player[],
): Promise<EdgeBriefing> {
  const catalog = await buildCatalog();
  const rivals: RivalSnapshot[] = [];

  for (const r of cfg.rivals.slice(0, 8)) {
    try {
      const squad = await loadSquad(r.entry_id, catalog);
      const cap = squad.picks.find((p) => p.is_captain);
      rivals.push({
        label: r.label,
        entry_id: r.entry_id,
        name: squad.name,
        team_name: squad.team_name,
        overall_rank: squad.overall_rank,
        owned_ids: squad.picks.map((p) => p.id),
        owned_names: squad.picks.map((p) => p.web_name),
        captain: cap?.web_name,
      });
    } catch {
      // skip bad rival ids
    }
  }

  const yourIds = new Set(yourPicks.map((p) => p.id));
  const scoredYours = yourPicks.map((p) =>
    scorePlayer(p, { horizon: cfg.horizon_gws, risk: cfg.risk_mode }),
  );

  const your_unique = scoredYours
    .filter((p) => ownershipCount(p.id, rivals).count === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // Players many rivals own that you don't
  const rivalCounts = new Map<number, { names: Set<string>; web_name: string; ownership: number }>();
  for (const rival of rivals) {
    for (let i = 0; i < rival.owned_ids.length; i++) {
      const id = rival.owned_ids[i];
      if (yourIds.has(id)) continue;
      const existing = rivalCounts.get(id) || {
        names: new Set<string>(),
        web_name: rival.owned_names[i],
        ownership: 0,
      };
      existing.names.add(rival.label);
      const market = catalog.players.find((p) => p.id === id);
      existing.ownership = market?.ownership ?? existing.ownership;
      existing.web_name = market?.web_name ?? existing.web_name;
      rivalCounts.set(id, existing);
    }
  }
  const rival_template = [...rivalCounts.entries()]
    .map(([, v]) => ({
      web_name: v.web_name,
      owned_by: [...v.names],
      ownership: v.ownership,
    }))
    .filter((x) => x.owned_by.length >= Math.max(1, Math.ceil(rivals.length * 0.5)))
    .sort((a, b) => b.owned_by.length - a.owned_by.length)
    .slice(0, 10);

  const caps = captainShortlist(yourPicks, {
    horizon: 3,
    risk: cfg.risk_mode,
  });
  const differential_captain_ideas = [];
  const threshold = cfg.strategy.prefer_differential_captain_when_delta_lt ?? 1.5;
  if (caps.length >= 2) {
    const [c1, c2] = caps;
    const c1EO = ownershipCount(c1.id, rivals);
    const c2EO = ownershipCount(c2.id, rivals);
    if (
      Math.abs(c1.score - c2.score) <= threshold &&
      c2EO.count < c1EO.count
    ) {
      differential_captain_ideas.push({
        player: c2.web_name,
        reason: `Score within ${threshold} of ${c1.web_name}, but fewer rivals own/captain path (${c2EO.count}/${rivals.length} vs ${c1EO.count}/${rivals.length}).`,
        rivals_without: rivals
          .filter((r) => !r.owned_ids.includes(c2.id))
          .map((r) => r.label),
      });
    }
    // Unique premium in your squad
    for (const c of caps.slice(0, 4)) {
      const eo = ownershipCount(c.id, rivals);
      if (eo.count === 0 && c.minutes_factor >= 0.75) {
        differential_captain_ideas.push({
          player: c.web_name,
          reason: `Nobody tracked owns ${c.web_name} — rank upside if they haul.`,
          rivals_without: rivals.map((r) => r.label),
        });
      }
    }
  }

  const transfer_pressure: string[] = [];
  for (const t of rival_template.slice(0, 5)) {
    transfer_pressure.push(
      `Rivals lean ${t.web_name} (${t.owned_by.join(", ")}). You don't — only match if football case is strong; otherwise lean into your uniques.`,
    );
  }
  if (your_unique[0]) {
    transfer_pressure.push(
      `Protect/stack your unique edge: ${your_unique
        .slice(0, 3)
        .map((p) => p.web_name)
        .join(", ")}.`,
    );
  }

  const strategy_notes = [
    `Mode: ${cfg.strategy.mode} — ${cfg.strategy.notes || ""}`,
    rivals.length
      ? `Tracking ${rivals.length} rival(s).`
      : "Add rival entry IDs in config.json for mini-league edge.",
    base.lineup
      ? `Suggested XI ${base.lineup.formation}: ${base.lineup.xi.map((p) => p.web_name).join(", ")}`
      : "",
  ].filter(Boolean);

  return {
    you: base,
    rivals,
    vs_rivals: {
      your_unique,
      rival_template,
      differential_captain_ideas: differential_captain_ideas.slice(0, 4),
      transfer_pressure,
    },
    strategy_notes,
  };
}

export async function loadYourPicks(entryId: number): Promise<Player[]> {
  const catalog = await buildCatalog();
  const squad = await loadSquad(entryId, catalog);
  return squad.picks;
}

export { suggestLineup };
