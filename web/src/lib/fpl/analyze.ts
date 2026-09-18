import { buildCatalog, loadSquad } from "./catalog";
import { injuryFeed, squadAvailability } from "./news";
import {
  captainShortlist,
  rankPlayers,
  suggestLineup,
  transferIdeas,
} from "./scoring";
import type { AnalyzeResult, RiskMode } from "./types";

export async function analyzeEntry(opts: {
  entryId: number;
  risk?: RiskMode;
  horizon?: number;
  freeTransfers?: number;
}): Promise<AnalyzeResult> {
  const {
    entryId,
    risk = "balanced",
    horizon = 5,
    freeTransfers = 1,
  } = opts;

  const catalog = await buildCatalog();
  const squad = await loadSquad(entryId, catalog);
  const owned = new Set(squad.picks.map((p) => p.id));

  const top = rankPlayers(catalog.players, {
    horizon,
    risk,
    minMinutes: 180,
    limit: 12,
  });
  const diffs = rankPlayers(catalog.players, {
    horizon,
    risk: "aggressive",
    minMinutes: 180,
    limit: 40,
  })
    .filter((p) => p.is_differential)
    .slice(0, 8);

  const captains = captainShortlist(squad.picks, {
    horizon: Math.min(3, horizon),
    risk,
  });
  const lineup = suggestLineup(squad.picks, {
    horizon: Math.min(3, horizon),
    risk,
  });
  const transfers = transferIdeas(catalog.players, squad.picks, {
    bank: squad.bank,
    freeTransfers,
    horizon,
    risk,
  });

  const squadFlags = squadAvailability(squad.picks);
  const recent = injuryFeed(catalog.players, { ownedIds: owned, limit: 20 });

  const actions: string[] = [];
  if (squadFlags.length) {
    actions.push(
      "1) Availability first: " +
        squadFlags
          .slice(0, 4)
          .map(
            (f) =>
              `${f.web_name} [${f.status_label}] ${f.news || ""}`.trim(),
          )
          .join("; "),
    );
  } else {
    actions.push(
      "1) Availability: no major flags — re-check pressers near deadline.",
    );
  }

  if (transfers.ideas[0]?.worthwhile) {
    const best = transfers.ideas[0];
    const cover =
      best.kind === "dead-bench" ? " [bench/auto-sub cover]" : "";
    actions.push(
      `2) Transfer${cover}: ${best.out.web_name} -> ${best.in.web_name} (delta ${best.delta >= 0 ? "+" : ""}${best.delta.toFixed(2)}${best.hit_cost ? ", -4 hit" : ", free"}). ${best.reason}.`,
    );
  } else {
    actions.push(
      "2) Transfers: HOLD — no move clears the edge-after-hit bar. Bank FT if possible.",
    );
  }
  if (transfers.dead_bench?.length) {
    actions.push(
      `2b) Dead bench (poor auto-sub cover): ${transfers.dead_bench
        .slice(0, 3)
        .map((p) => p.web_name)
        .join(", ")}.`,
    );
  }

  if (captains[0]) {
    const c1 = captains[0];
    const c2 = captains[1];
    let eoNote = "";
    if (
      c2 &&
      Math.abs(c1.score - c2.score) < 1.2 &&
      (c2.eo_proxy || 100) + 15 < (c1.eo_proxy || 0)
    ) {
      eoNote = ` Close scores: consider ${c2.web_name} for lower EO upside.`;
    }
    actions.push(
      `3) Captain: ${c1.web_name} (score ${c1.score}, ep_next ${c1.ep_next}, own% ${c1.ownership}). Vice: ${c2?.web_name ?? "n/a"}.${eoNote}`,
    );
  }

  if (lineup.xi.length === 11) {
    const xiNames = lineup.xi.map((p) => p.web_name).join(", ");
    actions.push(`3b) Start (${lineup.formation}): ${xiNames}.`);
  }

  const used = new Set((squad.chips || []).map((c) => c.name).filter(Boolean));
  actions.push(
    `4) Chips: used=${used.size ? [...used].sort().join(",") : "none"}. Don't force chips.`,
  );
  actions.push(
    "5) Deadline: wait for confirmed lineups when rotation risk is high.",
  );

  const cur = catalog.current_event;
  const nxt = catalog.next_event;

  return {
    gameweek: {
      current: cur?.id,
      next: nxt?.id,
      deadline: (nxt || cur)?.deadline_time,
      name: (nxt || cur)?.name,
    },
    risk_mode: risk,
    squad: {
      name: squad.name,
      team_name: squad.team_name,
      overall_rank: squad.overall_rank,
      bank: squad.bank,
      team_value: squad.team_value,
      event_id: squad.event_id,
    },
    actions,
    captain_shortlist: captains,
    transfers,
    news: { squad_flags: squadFlags, recent_injuries: recent },
    top_assets: top,
    differentials: diffs,
    lineup,
  };
}
