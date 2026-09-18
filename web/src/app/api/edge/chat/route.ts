import { NextResponse } from "next/server";
import { analyzeEntry } from "@/lib/fpl/analyze";
import { loadEdgeConfig } from "@/lib/edge/config";
import { buildEdgeBriefing, loadYourPicks } from "@/lib/edge/briefing";
import { answerWithOptionalLlm } from "@/lib/fpl/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const cfg = loadEdgeConfig();
  try {
    const you = await analyzeEntry({
      entryId: cfg.entry_id,
      risk: cfg.risk_mode,
      freeTransfers: cfg.free_transfers,
      horizon: cfg.horizon_gws,
    });
    const picks = await loadYourPicks(cfg.entry_id);
    const briefing = await buildEdgeBriefing(cfg, you, picks);

    const q = message.toLowerCase();
    let reply: string;

    if (
      q.includes("rival") ||
      q.includes("mini") ||
      q.includes("league") ||
      q.includes("edge") ||
      q.includes("differential captain") ||
      q.includes("vs ")
    ) {
      reply = formatRivalReply(briefing);
    } else {
      const enriched = {
        ...you,
        actions: [
          ...briefing.strategy_notes.map((n, i) => `${i}) ${n}`),
          ...you.actions,
          ...briefing.vs_rivals.transfer_pressure.slice(0, 2),
        ],
      };
      const out = await answerWithOptionalLlm(
        message,
        enriched,
        body.history || [],
      );
      // Append rival nugget when relevant
      const nugget =
        briefing.vs_rivals.differential_captain_ideas[0] ||
        briefing.vs_rivals.your_unique[0]
          ? `\n\n---\n**Edge vs rivals:** ${
              briefing.vs_rivals.differential_captain_ideas[0]
                ? `Diff captain idea — ${briefing.vs_rivals.differential_captain_ideas[0].player}: ${briefing.vs_rivals.differential_captain_ideas[0].reason}`
                : `Your uniques: ${briefing.vs_rivals.your_unique
                    .slice(0, 3)
                    .map((p) => p.web_name)
                    .join(", ")}`
            }`
          : "";
      reply = out.reply + nugget;
    }

    return NextResponse.json({
      reply,
      briefing: {
        rivals: briefing.rivals.map((r) => ({
          label: r.label,
          name: r.name,
          overall_rank: r.overall_rank,
          captain: r.captain,
        })),
        your_unique: briefing.vs_rivals.your_unique.map((p) => p.web_name),
        strategy: cfg.strategy,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Edge chat failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function formatRivalReply(briefing: Awaited<ReturnType<typeof buildEdgeBriefing>>) {
  const lines: string[] = [
    "**Private edge briefing (rivals)**",
    "",
    ...briefing.strategy_notes.map((n) => `• ${n}`),
    "",
  ];
  if (!briefing.rivals.length) {
    lines.push(
      "No rivals configured. Edit `config.json` → `rivals` with their entry IDs.",
    );
    return lines.join("\n");
  }
  lines.push("**Rivals tracked**");
  for (const r of briefing.rivals) {
    lines.push(
      `• ${r.label}: ${r.name} (${r.team_name}) OR ${r.overall_rank?.toLocaleString() ?? "—"} · C: ${r.captain ?? "?"}`,
    );
  }
  lines.push("", "**Your unique assets** (none of these rivals own)");
  if (!briefing.vs_rivals.your_unique.length) {
    lines.push("• None — you look template vs this group.");
  } else {
    for (const p of briefing.vs_rivals.your_unique) {
      lines.push(
        `• **${p.web_name}** (${p.team} ${p.position}) score ${p.score.toFixed(2)}`,
      );
    }
  }
  lines.push("", "**Rival template you don't own**");
  if (!briefing.vs_rivals.rival_template.length) {
    lines.push("• You're covering the main rival template.");
  } else {
    for (const t of briefing.vs_rivals.rival_template) {
      lines.push(
        `• **${t.web_name}** — owned by ${t.owned_by.join(", ")} (${t.ownership}% overall)`,
      );
    }
  }
  lines.push("", "**Differential captain ideas**");
  if (!briefing.vs_rivals.differential_captain_ideas.length) {
    lines.push("• Stick with highest score captain this week.");
  } else {
    for (const d of briefing.vs_rivals.differential_captain_ideas) {
      lines.push(`• **${d.player}** — ${d.reason}`);
    }
  }
  lines.push("", "**Pressure / posture**");
  for (const t of briefing.vs_rivals.transfer_pressure.slice(0, 5)) {
    lines.push(`• ${t}`);
  }
  return lines.join("\n");
}
