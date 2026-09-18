import { NextResponse } from "next/server";
import { analyzeEntry } from "@/lib/fpl/analyze";
import { answerWithOptionalLlm } from "@/lib/fpl/chat";
import type { RiskMode } from "@/lib/fpl/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  entryId?: number | string;
  message?: string;
  risk?: RiskMode;
  ft?: number;
  history?: { role: "user" | "assistant"; content: string }[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const entryId = Number(body.entryId);
  const message = (body.message || "").trim();
  if (!Number.isFinite(entryId) || entryId <= 0) {
    return NextResponse.json(
      { error: "Pass a valid entryId." },
      { status: 400 },
    );
  }
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const risk = body.risk || "balanced";
  const ft = Number(body.ft ?? 1);

  try {
    const data = await analyzeEntry({
      entryId,
      risk: ["safe", "balanced", "aggressive"].includes(risk)
        ? risk
        : "balanced",
      freeTransfers: Number.isFinite(ft) ? ft : 1,
      horizon: 5,
    });
    const { reply, mode } = await answerWithOptionalLlm(
      message,
      data,
      body.history || [],
    );
    return NextResponse.json({
      reply,
      mode,
      snapshot: {
        gameweek: data.gameweek,
        squad: data.squad,
        actions: data.actions,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chat failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
