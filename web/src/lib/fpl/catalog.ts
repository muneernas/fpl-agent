import {
  fetchBootstrap,
  fetchEntry,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchFixtures,
} from "./api";
import type { FixtureSlice, Player, SquadData } from "./types";

const POSITIONS: Record<number, string> = {
  1: "GKP",
  2: "DEF",
  3: "MID",
  4: "FWD",
};

function num(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

type BootEl = Record<string, unknown>;
type Team = { id: number; short_name: string };
type Event = {
  id: number;
  name?: string;
  is_current?: boolean;
  is_next?: boolean;
  deadline_time?: string;
};

export function currentEvent(events: Event[]): Event | undefined {
  return events.find((e) => e.is_current) ?? events.find((e) => e.is_next) ?? events[0];
}

export function nextEvent(events: Event[]): Event | undefined {
  const nxt = events.find((e) => e.is_next);
  if (nxt) return nxt;
  const cur = currentEvent(events);
  if (!cur) return undefined;
  return events.find((e) => e.id === cur.id + 1);
}

export async function buildCatalog() {
  const [boot, fixtures] = await Promise.all([fetchBootstrap(), fetchFixtures()]);
  const events = (boot.events as Event[]) || [];
  const teamsList = (boot.teams as Team[]) || [];
  const teams = Object.fromEntries(teamsList.map((t) => [t.id, t]));
  const cur = currentEvent(events);
  const nxt = nextEvent(events);

  const upcomingByTeam: Record<number, FixtureSlice[]> = {};
  for (const t of teamsList) upcomingByTeam[t.id] = [];

  for (const fx of fixtures) {
    if (fx.finished || fx.event == null) continue;
    const event = Number(fx.event);
    if (cur && event < cur.id) continue;
    const pairs: [string, string, string, boolean][] = [
      ["team_h", "team_a", "team_h_difficulty", true],
      ["team_a", "team_h", "team_a_difficulty", false],
    ];
    for (const [side, opp, diffKey, home] of pairs) {
      const tid = Number(fx[side]);
      upcomingByTeam[tid]?.push({
        event,
        opponent_id: Number(fx[opp]),
        opponent: teams[Number(fx[opp])]?.short_name ?? "?",
        difficulty: num(fx[diffKey], 3),
        is_home: home,
        kickoff_time: (fx.kickoff_time as string) ?? null,
      });
    }
  }

  for (const tid of Object.keys(upcomingByTeam)) {
    upcomingByTeam[Number(tid)].sort((a, b) =>
      a.event !== b.event
        ? a.event - b.event
        : String(a.kickoff_time).localeCompare(String(b.kickoff_time)),
    );
  }

  const players: Player[] = [];
  for (const el of (boot.elements as BootEl[]) || []) {
    if (el.removed) continue;
    const teamId = Number(el.team);
    const upcoming = (upcomingByTeam[teamId] || []).slice(0, 8);
    const next3 = upcoming.slice(0, 3);
    const next5 = upcoming.slice(0, 5);
    const avg3 =
      next3.length > 0
        ? next3.reduce((s, f) => s + f.difficulty, 0) / next3.length
        : 3;
    const avg5 =
      next5.length > 0
        ? next5.reduce((s, f) => s + f.difficulty, 0) / next5.length
        : 3;

    const status = String(el.status ?? "a");
    let chance = el.chance_of_playing_next_round as number | null;
    if (chance == null) chance = status === "a" ? 100 : status === "d" ? 75 : 0;

    players.push({
      id: Number(el.id),
      web_name: String(el.web_name || el.second_name || ""),
      full_name: `${el.first_name ?? ""} ${el.second_name ?? ""}`.trim(),
      team_id: teamId,
      team: teams[teamId]?.short_name ?? "?",
      position: POSITIONS[Number(el.element_type)] ?? "?",
      position_id: Number(el.element_type),
      cost: num(el.now_cost) / 10,
      status,
      news: String(el.news || ""),
      news_added: (el.news_added as string) ?? null,
      scout_news_link: String(el.scout_news_link || ""),
      chance_this: (el.chance_of_playing_this_round as number) ?? null,
      chance_next: chance,
      minutes: num(el.minutes),
      starts: num(el.starts),
      form: num(el.form),
      points_per_game: num(el.points_per_game),
      total_points: num(el.total_points),
      ownership: num(el.selected_by_percent),
      ep_this: num(el.ep_this),
      ep_next: num(el.ep_next),
      xg: num(el.expected_goals),
      xa: num(el.expected_assists),
      xgi: num(el.expected_goal_involvements),
      xg90: num(el.expected_goals_per_90),
      xa90: num(el.expected_assists_per_90),
      xgi90: num(el.expected_goal_involvements_per_90),
      ict: num(el.ict_index),
      defensive_contribution_per_90: num(el.defensive_contribution_per_90),
      penalties_order: (el.penalties_order as number) ?? null,
      corners_order: (el.corners_and_indirect_freekicks_order as number) ?? null,
      direct_freekicks_order: (el.direct_freekicks_order as number) ?? null,
      avg_fdr_next3: Math.round(avg3 * 100) / 100,
      avg_fdr_next5: Math.round(avg5 * 100) / 100,
      next_fixtures: next5,
      can_select: Boolean(el.can_select ?? true),
    });
  }

  return { bootstrap: boot, current_event: cur, next_event: nxt, teams, players, fixtures };
}

export async function loadSquad(
  entryId: number,
  catalog: Awaited<ReturnType<typeof buildCatalog>>,
): Promise<SquadData> {
  const entry = await fetchEntry(entryId);
  const cur = catalog.current_event;
  if (!cur?.id) throw new Error("No current gameweek found");

  let eventId = cur.id;
  let picksPayload: Record<string, unknown> | null = null;
  try {
    picksPayload = await fetchEntryPicks(entryId, eventId);
  } catch {
    picksPayload = null;
  }
  if (!picksPayload && eventId > 1) {
    picksPayload = await fetchEntryPicks(entryId, eventId - 1);
    eventId -= 1;
  }
  if (!picksPayload) throw new Error(`Could not load picks for entry ${entryId}`);

  const byId = Object.fromEntries(catalog.players.map((p) => [p.id, p]));
  const rawPicks = (picksPayload.picks as Record<string, unknown>[]) || [];
  const picks: Player[] = rawPicks.map((pick) => {
    const base = byId[Number(pick.element)] ?? {
      id: Number(pick.element),
      web_name: `#${pick.element}`,
      full_name: "",
      team_id: 0,
      team: "?",
      position: "?",
      position_id: 0,
      cost: 0,
      status: "a",
      news: "",
      chance_next: 100,
      minutes: 0,
      starts: 0,
      form: 0,
      points_per_game: 0,
      total_points: 0,
      ownership: 0,
      ep_this: 0,
      ep_next: 0,
      xg: 0,
      xa: 0,
      xgi: 0,
      xg90: 0,
      xa90: 0,
      xgi90: 0,
      ict: 0,
      defensive_contribution_per_90: 0,
      avg_fdr_next3: 3,
      avg_fdr_next5: 3,
      next_fixtures: [],
      can_select: true,
    };
    return {
      ...base,
      multiplier: num(pick.multiplier),
      is_captain: Boolean(pick.is_captain),
      is_vice_captain: Boolean(pick.is_vice_captain),
      position_slot: num(pick.position),
      selling_price: num(pick.selling_price) / 10,
    };
  });

  const history = await fetchEntryHistory(entryId);
  return {
    entry,
    event_id: eventId,
    picks,
    chips: (history.chips as { name?: string }[]) || [],
    bank: num(entry.last_deadline_bank) / 10,
    team_value: num(entry.last_deadline_value) / 10,
    overall_rank: num(entry.summary_overall_rank) || undefined,
    overall_points: num(entry.summary_overall_points) || undefined,
    name: `${entry.player_first_name ?? ""} ${entry.player_last_name ?? ""}`.trim(),
    team_name: String(entry.name ?? ""),
  };
}
