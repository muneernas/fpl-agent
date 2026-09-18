export type RiskMode = "safe" | "balanced" | "aggressive";

export type Player = {
  id: number;
  web_name: string;
  full_name: string;
  team_id: number;
  team: string;
  position: string;
  position_id: number;
  cost: number;
  status: string;
  news: string;
  news_added?: string | null;
  scout_news_link?: string;
  chance_this?: number | null;
  chance_next: number;
  minutes: number;
  starts: number;
  form: number;
  points_per_game: number;
  total_points: number;
  ownership: number;
  ep_this: number;
  ep_next: number;
  xg: number;
  xa: number;
  xgi: number;
  xg90: number;
  xa90: number;
  xgi90: number;
  ict: number;
  defensive_contribution_per_90: number;
  penalties_order?: number | null;
  corners_order?: number | null;
  direct_freekicks_order?: number | null;
  avg_fdr_next3: number;
  avg_fdr_next5: number;
  next_fixtures: FixtureSlice[];
  can_select: boolean;
  selling_price?: number;
  multiplier?: number;
  is_captain?: boolean;
  is_vice_captain?: boolean;
  position_slot?: number;
};

export type FixtureSlice = {
  event: number;
  opponent_id: number;
  opponent: string;
  difficulty: number;
  is_home: boolean;
  kickoff_time?: string | null;
};

export type ScoredPlayer = Player & {
  score: number;
  value_score: number;
  minutes_factor: number;
  fixture_factor: number;
  is_differential: boolean;
  is_template: boolean;
  risk_flags: string[];
  eo_proxy?: number;
};

export type SquadData = {
  entry: Record<string, unknown>;
  event_id: number;
  picks: Player[];
  chips: { name?: string }[];
  bank: number;
  team_value: number;
  overall_rank?: number;
  overall_points?: number;
  name: string;
  team_name: string;
};

export type AnalyzeResult = {
  gameweek: {
    current?: number;
    next?: number;
    deadline?: string;
    name?: string;
  };
  risk_mode: RiskMode;
  squad?: {
    name: string;
    team_name: string;
    overall_rank?: number;
    bank: number;
    team_value: number;
    event_id: number;
  };
  actions: string[];
  captain_shortlist: ScoredPlayer[];
  transfers: {
    weak_links: ScoredPlayer[];
    dead_bench?: ScoredPlayer[];
    ideas: {
      out: ScoredPlayer;
      in: ScoredPlayer;
      delta: number;
      hit_cost: number;
      worthwhile: boolean;
      reason: string;
      kind?: string;
    }[];
    hold_recommendation: boolean;
  } | null;
  news: {
    squad_flags: NewsFlag[];
    recent_injuries: NewsFlag[];
  };
  top_assets: ScoredPlayer[];
  differentials: ScoredPlayer[];
  lineup: {
    formation: string;
    xi: ScoredPlayer[];
    bench: ScoredPlayer[];
    notes: string[];
  } | null;
};

export type NewsFlag = {
  id?: number;
  web_name: string;
  team: string;
  position?: string;
  status: string;
  status_label: string;
  chance_next?: number | null;
  news: string;
  news_added?: string | null;
  age_hours?: number | null;
  scout_news_link?: string;
  owned?: boolean;
};
