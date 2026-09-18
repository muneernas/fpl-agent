import type { RiskMode } from "@/lib/fpl/types";

export type EdgeConfig = {
  entry_id: number;
  risk_mode: RiskMode;
  free_transfers: number;
  horizon_gws: number;
  strategy: {
    mode: "protect" | "chase" | "balanced";
    max_hit: number;
    prefer_differential_captain_when_delta_lt: number;
    template_floor_pct: number;
    notes?: string;
  };
  rivals: { label: string; entry_id: number; notes?: string }[];
};

const DEFAULTS: EdgeConfig = {
  entry_id: 8682977,
  risk_mode: "aggressive",
  free_transfers: 1,
  horizon_gws: 5,
  strategy: {
    mode: "chase",
    max_hit: 4,
    prefer_differential_captain_when_delta_lt: 1.5,
    template_floor_pct: 55,
    notes: "OR chasing — calculated differentials vs mini-league",
  },
  rivals: [
    { label: "Omar", entry_id: 2254644 },
    { label: "Antone", entry_id: 8622803 },
    { label: "Mike", entry_id: 4776867 },
    { label: "Raed", entry_id: 10299890 },
    { label: "Ali", entry_id: 10300291 },
  ],
};

function loadFileConfig(): Partial<EdgeConfig> {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    return {};
  }
  try {
    // Local-only file config (avoid bundling whole project on Vercel)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync, readFileSync } = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    for (const name of ["edge-config.json", "config.json"]) {
      const file = path.join(/* turbopackIgnore: true */ process.cwd(), name);
      if (existsSync(file)) {
        return JSON.parse(readFileSync(file, "utf8")) as Partial<EdgeConfig>;
      }
    }
  } catch {
    // ignore
  }
  return {};
}

export function loadEdgeConfig(): EdgeConfig {
  const fileCfg = loadFileConfig();

  let rivals = fileCfg.rivals || [];
  if (process.env.EDGE_RIVALS) {
    try {
      rivals = JSON.parse(process.env.EDGE_RIVALS) as EdgeConfig["rivals"];
    } catch {
      // keep file rivals
    }
  }

  return {
    ...DEFAULTS,
    ...fileCfg,
    entry_id: Number(
      process.env.EDGE_ENTRY_ID || fileCfg.entry_id || DEFAULTS.entry_id,
    ),
    risk_mode:
      (process.env.EDGE_RISK as RiskMode) ||
      fileCfg.risk_mode ||
      DEFAULTS.risk_mode,
    free_transfers: Number(
      process.env.EDGE_FT || fileCfg.free_transfers || DEFAULTS.free_transfers,
    ),
    rivals: (rivals || []).filter((r) => r.entry_id && r.entry_id > 0),
    strategy: {
      ...DEFAULTS.strategy,
      ...(fileCfg.strategy || {}),
    },
  };
}
