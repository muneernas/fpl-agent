import { NextResponse } from "next/server";
import { analyzeEntry } from "@/lib/fpl/analyze";
import type { RiskMode } from "@/lib/fpl/types";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const entryId = Number(searchParams.get("entryId"));
  if (!Number.isFinite(entryId) || entryId <= 0) {
    return NextResponse.json(
      { error: "Pass a valid entryId query param (from your FPL team URL)." },
      { status: 400 },
    );
  }

  const risk = (searchParams.get("risk") as RiskMode) || "balanced";
  const horizon = Number(searchParams.get("horizon") || 5);
  const freeTransfers = Number(searchParams.get("ft") || 1);

  try {
    const data = await analyzeEntry({
      entryId,
      risk: ["safe", "balanced", "aggressive"].includes(risk)
        ? risk
        : "balanced",
      horizon: Number.isFinite(horizon) ? horizon : 5,
      freeTransfers: Number.isFinite(freeTransfers) ? freeTransfers : 1,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analyze failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
