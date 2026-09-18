import type { AnalyzeResult } from "./types";

function clean(msg: string) {
  return msg.trim().toLowerCase();
}

function isAbout(
  q: string,
  words: string[],
): boolean {
  return words.some((w) => q.includes(w));
}

export function answerFromAnalysis(
  message: string,
  data: AnalyzeResult,
): string {
  const q = clean(message);
  const squad = data.squad;
  const header = squad
    ? `**${squad.name}** (${squad.team_name}) · OR ${squad.overall_rank?.toLocaleString() ?? "—"} · GW${data.gameweek.next ?? data.gameweek.current}`
    : `GW${data.gameweek.next ?? data.gameweek.current}`;

  if (
    isAbout(q, [
      "start",
      "starting",
      "lineup",
      "line-up",
      "xi",
      "bench",
      "who should i play",
      "who do i play",
      "who to play",
      "pick my team",
      "set my team",
      "formation",
    ]) ||
    q.includes("who should i start")
  ) {
    const lineup = data.lineup;
    if (!lineup?.xi?.length) {
      return `${header}\n\nI need your squad loaded to pick a starting XI. Check the entry ID.`;
    }
    const byPos = (pos: string) =>
      lineup.xi
        .filter((p) => p.position === pos)
        .map((p) => {
          const risk =
            p.minutes_factor < 0.75
              ? ` ⚠ ${p.chance_next ?? "?"}%`
              : "";
          return `**${p.web_name}** (${p.team}, ${p.score.toFixed(2)}${risk})`;
        })
        .join(", ");
    const benchLines = lineup.bench
      .map(
        (p, i) =>
          `${i + 1}. **${p.web_name}** (${p.position}, ${p.team}) — score ${p.score.toFixed(2)}`,
      )
      .join("\n");
    return [
      header,
      "",
      `**Start this XI (${lineup.formation})**`,
      `GK: ${byPos("GKP")}`,
      `DEF: ${byPos("DEF")}`,
      `MID: ${byPos("MID")}`,
      `FWD: ${byPos("FWD")}`,
      "",
      "**Bench order** (auto-subs):",
      benchLines,
      "",
      ...(lineup.notes || []).map((n) => `• ${n}`),
    ].join("\n");
  }

  if (
    isAbout(q, [
      "captain",
      "captaincy",
      "armband",
      "triple captain",
      "tc ",
      " who c",
    ]) ||
    q === "c" ||
    q.includes("who should i captain")
  ) {
    const caps = data.captain_shortlist || [];
    if (!caps.length) {
      return `${header}\n\nI need your squad loaded to pick a captain. Check the entry ID.`;
    }
    const lines = caps.slice(0, 5).map((p, i) => {
      const fx = (p.next_fixtures || [])
        .slice(0, 2)
        .map((f) => `${f.opponent}(${f.is_home ? "H" : "A"})`)
        .join(", ");
      return `${i + 1}. **${p.web_name}** (${p.team}) — score ${p.score.toFixed(2)}, ep ${p.ep_next}, own% ${p.ownership}${fx ? ` · ${fx}` : ""}`;
    });
    return [
      header,
      "",
      `**Captain: ${caps[0].web_name}**`,
      caps[1] ? `**Vice: ${caps[1].web_name}**` : "",
      "",
      "Shortlist:",
      ...lines,
      "",
      "Rule: prefer minutes-secure + highest score. If top two are close and the lower-owned option is credible, that's your differential captain.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (
    isAbout(q, [
      "injur",
      "news",
      "doubt",
      "availab",
      "fitness",
      "suspended",
      "ban",
    ])
  ) {
    const flags = data.news?.squad_flags || [];
    const recent = (data.news?.recent_injuries || [])
      .filter((n) => n.owned)
      .slice(0, 6);
    if (!flags.length && !recent.length) {
      return `${header}\n\nNo major availability flags on your squad right now. Still re-check pressers near the deadline.`;
    }
    const lines = (flags.length ? flags : recent).map((f) => {
      const link = f.scout_news_link ? `\n   ${f.scout_news_link}` : "";
      return `• **${f.web_name}** (${f.team}) — ${f.status_label}, chance ${f.chance_next ?? "—"}%\n  ${f.news || "—"}${link}`;
    });
    return [header, "", "**Squad availability**", ...lines].join("\n");
  }

  if (
    isAbout(q, [
      "transfer",
      "wildcard",
      "hit",
      "-4",
      "sell",
      "buy",
      "bring in",
      "ship",
      "replace",
      "autosub",
      "auto-sub",
      "auto sub",
      "bench fodder",
      "coverage",
      "who should i transfer",
    ])
  ) {
    const ideas = data.transfers?.ideas || [];
    const dead = data.transfers?.dead_bench || [];
    if (!ideas.length) {
      return `${header}\n\nNo strong transfer ideas cleared the bar. **HOLD** and bank the free transfer unless news forces a move.`;
    }
    const deadLine = dead.length
      ? [
          "",
          "**Bench with little/no start time** (weak auto-sub cover if an XI player blanks/gets injured):",
          ...dead.map(
            (p) =>
              `• **${p.web_name}** (${p.position}, ${p.team}) — ${p.minutes} mins, ${p.starts} starts, ep ${p.ep_next}, score ${p.score.toFixed(2)}`,
          ),
        ]
      : [
          "",
          "No obvious non-playing bench deadwood flagged — still prefer startable depth over pure fodder.",
        ];
    const lines = ideas.slice(0, 6).map((idea, i) => {
      const tag = idea.worthwhile ? "GO" : "weak";
      const kind =
        idea.kind === "dead-bench"
          ? "bench cover"
          : idea.kind === "injury"
            ? "availability"
            : "upgrade";
      return `${i + 1}. [${tag}] [${kind}] **${idea.out.web_name} → ${idea.in.web_name}** (Δ${idea.delta >= 0 ? "+" : ""}${idea.delta.toFixed(2)}, hit ${idea.hit_cost})\n   ${idea.reason}`;
    });
    const hold = data.transfers?.hold_recommendation
      ? "\n\nOverall lean: **HOLD** unless the top GO move fixes minutes/auto-sub coverage."
      : "\n\nPriority: fix **non-starting bench** first so auto-subs can still score if someone in your XI is injured.";
    return [
      header,
      "",
      "**Who to transfer (auto-sub aware)**",
      ...deadLine,
      "",
      "**Suggested moves**",
      ...lines,
      hold,
    ].join("\n");
  }

  if (
    isAbout(q, [
      "differential",
      "differentials",
      "low owned",
      "punt",
      "underowned",
    ])
  ) {
    const diffs = data.differentials || [];
    if (!diffs.length) {
      return `${header}\n\nNo strong differentials in the current screen.`;
    }
    const lines = diffs.slice(0, 8).map((p, i) => {
      return `${i + 1}. **${p.web_name}** (${p.team} ${p.position}) — £${p.cost.toFixed(1)}, own% ${p.ownership}, score ${p.score.toFixed(2)}, xGI90 ${p.xgi90.toFixed(2)}`;
    });
    return [
      header,
      "",
      "**Differentials** (low ownership + real score — not random punts):",
      ...lines,
    ].join("\n");
  }

  if (
    isAbout(q, ["chip", "bench boost", "free hit", "triple", "bb", "fh", "wc"])
  ) {
    return [
      header,
      "",
      data.actions.find((a) => a.toLowerCase().includes("chip")) ||
        "Chips: only play when fixtures + minutes align — don't force.",
      "",
      "Ask about blanks/doubles closer to those gameweeks for a tighter chip call.",
    ].join("\n");
  }

  // Default: what to do next (explicit asks only — avoid stealing "who should I start?")
  if (
    isAbout(q, [
      "next",
      "what should i do",
      "advise",
      "advice",
      "help me",
      "plan",
      "this week",
      "gameweek plan",
    ]) ||
    q === "help" ||
    q === "hi" ||
    q === "hello"
  ) {
    const actions = (data.actions || []).map((a) => `• ${a.replace(/^\d+\)\s*/, "")}`);
    const caps = data.captain_shortlist?.[0];
    return [
      header,
      "",
      "**What to do next**",
      ...actions,
      "",
      caps
        ? `Quick lock-in: captain **${caps.web_name}** unless late news flips minutes.`
        : "",
      "",
      "You can also ask: start / lineup · captain · transfers · injuries · differentials · chips",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    header,
    "",
    "I can help with **who to start**, **captain**, **transfers**, **injuries**, **differentials**, **chips**, or **what to do next**.",
    "Try one of those, or ask a sharper question about your squad.",
  ].join("\n");
}

export async function answerWithOptionalLlm(
  message: string,
  data: AnalyzeResult,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<{ reply: string; mode: "rules" | "llm" }> {
  const rulesReply = answerFromAnalysis(message, data);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { reply: rulesReply, mode: "rules" };
  }

  const context = JSON.stringify(
    {
      gameweek: data.gameweek,
      squad: data.squad,
      actions: data.actions,
      captain_shortlist: data.captain_shortlist.slice(0, 5).map((p) => ({
        web_name: p.web_name,
        team: p.team,
        score: p.score,
        ep_next: p.ep_next,
        ownership: p.ownership,
      })),
      transfers: data.transfers?.ideas.slice(0, 5).map((i) => ({
        out: i.out.web_name,
        in: i.in.web_name,
        delta: i.delta,
        worthwhile: i.worthwhile,
        reason: i.reason,
        kind: i.kind,
      })),
      dead_bench: data.transfers?.dead_bench?.map((p) => ({
        web_name: p.web_name,
        position: p.position,
        minutes: p.minutes,
        starts: p.starts,
        ep_next: p.ep_next,
      })),
      squad_flags: data.news.squad_flags,
      lineup: data.lineup
        ? {
            formation: data.lineup.formation,
            xi: data.lineup.xi.map((p) => ({
              web_name: p.web_name,
              position: p.position,
              team: p.team,
              score: p.score,
              chance_next: p.chance_next,
            })),
            bench: data.lineup.bench.map((p) => ({
              web_name: p.web_name,
              position: p.position,
              score: p.score,
            })),
            notes: data.lineup.notes,
          }
        : null,
    },
    null,
    0,
  );

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `You are NEXTGW, a decisive Fantasy Premier League advisor. Use ONLY the provided live analysis JSON. Prefer minutes/availability first, then transfers, then captain. Be concise. Never invent injuries or prices. If unsure, say what to check before deadline.`,
          },
          {
            role: "system",
            content: `Live analysis:\n${context}`,
          },
          ...history.slice(-8),
          { role: "user", content: message },
        ],
      }),
    });
    if (!res.ok) {
      return { reply: rulesReply, mode: "rules" };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return { reply: rulesReply, mode: "rules" };
    return { reply: text, mode: "llm" };
  } catch {
    return { reply: rulesReply, mode: "rules" };
  }
}
