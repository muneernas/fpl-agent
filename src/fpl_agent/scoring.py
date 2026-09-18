"""Research-backed scoring for FPL decisions.

Signals prioritized from public FPL strategy research + official API fields:
- Minutes / availability first (chance_of_playing, status, news)
- Official ep_next / ep_this as primary expected-points proxy
- Underlying xG / xA / xGI (season + per-90) over raw form alone
- Fixture difficulty (FDR) over next 3–5 GWs
- Ownership for template vs differential framing (not as a quality score)
- Set-piece / penalty order as upside flags
- Hit rule: only recommend -4 if projected net gain clearly > 4
"""

from __future__ import annotations

from typing import Any, Literal

RiskMode = Literal["safe", "balanced", "aggressive"]


def minutes_factor(player: dict[str, Any]) -> float:
    chance = player.get("chance_next", 100) or 0
    status = player.get("status", "a")
    if status in {"u", "s", "n"}:  # unavailable / suspended / not in squad
        return 0.05
    if status == "i":
        return max(0.1, chance / 100.0 * 0.5)
    if status == "d":
        return max(0.2, chance / 100.0)
    return max(0.15, min(1.0, chance / 100.0))


def fixture_factor(avg_fdr: float) -> float:
    # FDR 1 easy → 1.15, FDR 5 hard → 0.75
    return max(0.7, min(1.2, 1.3 - (avg_fdr - 1) * 0.12))


def underlying_boost(player: dict[str, Any]) -> float:
    xgi90 = player.get("xgi90", 0.0) or 0.0
    # Typical elite attackers ~0.6–1.0 xGI/90; scale gently
    return min(0.35, xgi90 * 0.25)


def set_piece_boost(player: dict[str, Any]) -> float:
    boost = 0.0
    if player.get("penalties_order") == 1:
        boost += 0.12
    elif player.get("penalties_order") in {2, 3}:
        boost += 0.04
    if player.get("corners_order") == 1:
        boost += 0.05
    if player.get("direct_freekicks_order") == 1:
        boost += 0.03
    return boost


def score_player(player: dict[str, Any], *, horizon: int = 5, risk: RiskMode = "balanced") -> dict[str, Any]:
    mf = minutes_factor(player)
    fdr = player.get("avg_fdr_next3") if horizon <= 3 else player.get("avg_fdr_next5", player.get("avg_fdr_next3", 3))
    ff = fixture_factor(float(fdr or 3))
    ep = player.get("ep_next") or player.get("ep_this") or 0.0
    form = player.get("form") or 0.0
    # Blend: official EP primary, form secondary, underlying + set pieces as adjustments
    raw = (ep * 0.7 + form * 0.3) * mf * ff
    raw *= 1.0 + underlying_boost(player) + set_piece_boost(player)

    # Defenders / GK: lean a bit on clean-sheet friendly FDR already in ff;
    # add tiny defensive contribution signal if present (25/26 scoring).
    if player.get("position") in {"DEF", "GKP"}:
        raw *= 1.0 + min(0.1, (player.get("defensive_contribution_per_90") or 0) * 0.02)

    ownership = player.get("ownership") or 0.0
    differential = ownership < 8.0 and raw >= 3.5 and mf >= 0.75
    template = ownership >= 25.0

    if risk == "safe":
        # Prefer higher ownership / minutes certainty
        raw *= 0.95 + min(0.1, ownership / 500.0)
        raw *= 0.9 + 0.1 * mf
    elif risk == "aggressive":
        if differential:
            raw *= 1.08
        if ownership < 5 and mf >= 0.8:
            raw *= 1.04

    value = raw / max(player.get("cost") or 4.0, 3.5)

    return {
        **player,
        "score": round(raw, 3),
        "value_score": round(value, 3),
        "minutes_factor": round(mf, 3),
        "fixture_factor": round(ff, 3),
        "is_differential": differential,
        "is_template": template,
        "risk_flags": _flags(player, mf),
    }


def _flags(player: dict[str, Any], mf: float) -> list[str]:
    flags: list[str] = []
    if mf < 0.5:
        flags.append("minutes-risk")
    if player.get("news"):
        flags.append("news")
    if player.get("status") != "a":
        flags.append(f"status:{player.get('status')}")
    if (player.get("avg_fdr_next3") or 3) >= 4.2:
        flags.append("tough-fixtures")
    if player.get("penalties_order") == 1:
        flags.append("pens")
    return flags


def rank_players(
    players: list[dict[str, Any]],
    *,
    position: str | None = None,
    horizon: int = 5,
    risk: RiskMode = "balanced",
    min_minutes: int = 0,
    available_only: bool = True,
    limit: int = 20,
) -> list[dict[str, Any]]:
    scored = []
    for p in players:
        if position and p.get("position") != position:
            continue
        if available_only and not p.get("can_select", True):
            continue
        if available_only and p.get("status") in {"u", "s"}:
            continue
        if min_minutes and (p.get("minutes") or 0) < min_minutes:
            continue
        scored.append(score_player(p, horizon=horizon, risk=risk))
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:limit]


def captain_shortlist(
    squad: list[dict[str, Any]],
    *,
    horizon: int = 3,
    risk: RiskMode = "balanced",
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Captain from OWN squad only; require minutes confidence."""
    starters = [p for p in squad if (p.get("multiplier") or 0) > 0 or (p.get("position_slot") or 99) <= 11]
    pool = starters or squad
    ranked = []
    for p in pool:
        s = score_player(p, horizon=horizon, risk=risk)
        # Captain needs high minutes confidence
        if s["minutes_factor"] < 0.75:
            s["score"] *= 0.5
            s["risk_flags"] = list(s.get("risk_flags") or []) + ["low-captain-minutes"]
        # Effective ownership proxy: raw ownership (true EO needs captain rates)
        s["eo_proxy"] = s.get("ownership") or 0.0
        ranked.append(s)
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked[:limit]


def transfer_ideas(
    catalog_players: list[dict[str, Any]],
    squad: list[dict[str, Any]],
    *,
    bank: float = 0.0,
    free_transfers: int = 1,
    horizon: int = 5,
    risk: RiskMode = "balanced",
    limit: int = 8,
) -> dict[str, Any]:
    owned_ids = {p["id"] for p in squad}
    squad_scored = [score_player(p, horizon=horizon, risk=risk) for p in squad]
    squad_scored.sort(key=lambda x: x["score"])

    weak = [p for p in squad_scored if p["minutes_factor"] < 0.6 or "tough-fixtures" in (p.get("risk_flags") or [])]
    if not weak:
        weak = squad_scored[:3]

    market = rank_players(
        [p for p in catalog_players if p["id"] not in owned_ids],
        horizon=horizon,
        risk=risk,
        min_minutes=90,
        limit=80,
    )

    ideas = []
    for out in weak:
        out_pos = out.get("position")
        budget = bank + (out.get("selling_price") or out.get("cost") or 0)
        candidates = [
            c
            for c in market
            if c.get("position") == out_pos and (c.get("cost") or 99) <= budget + 0.05 and c["score"] > out["score"] + 0.4
        ][:5]
        for inn in candidates:
            delta = inn["score"] - out["score"]
            hit_cost = 0 if free_transfers >= 1 else 4
            # Rough: score roughly maps to expected points scale; require clear edge after hit
            worthwhile = delta > (hit_cost * 0.85 + 0.5)
            ideas.append(
                {
                    "out": out,
                    "in": inn,
                    "delta": round(delta, 3),
                    "hit_cost": hit_cost,
                    "worthwhile": worthwhile,
                    "budget_after": round(budget - (inn.get("cost") or 0), 1),
                    "reason": _transfer_reason(out, inn, delta, hit_cost),
                }
            )

    ideas.sort(key=lambda x: (x["worthwhile"], x["delta"]), reverse=True)
    # de-dupe by out/in pairs preference
    seen = set()
    unique = []
    for idea in ideas:
        key = (idea["out"]["id"], idea["in"]["id"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(idea)
        if len(unique) >= limit:
            break

    return {
        "weak_links": weak[:5],
        "ideas": unique,
        "hold_recommendation": not any(i["worthwhile"] for i in unique[:3]),
    }


def _transfer_reason(out: dict[str, Any], inn: dict[str, Any], delta: float, hit: int) -> str:
    bits = []
    if out.get("minutes_factor", 1) < 0.6:
        bits.append(f"{out['web_name']} minutes risk")
    if (out.get("avg_fdr_next3") or 3) - (inn.get("avg_fdr_next3") or 3) >= 0.8:
        bits.append("fixture swing")
    if inn.get("xgi90", 0) > out.get("xgi90", 0) + 0.15:
        bits.append("stronger underlying xGI/90")
    if inn.get("is_differential"):
        bits.append("differential upside")
    if hit:
        bits.append(f"requires -{hit}")
    bits.append(f"score delta {delta:+.2f}")
    return "; ".join(bits)


def what_to_do_next(
    catalog: dict[str, Any],
    squad_data: dict[str, Any] | None,
    *,
    horizon: int = 5,
    risk: RiskMode = "balanced",
    free_transfers: int = 1,
) -> dict[str, Any]:
    from .news import build_news_report

    players = catalog["players"]
    cur = catalog.get("current_event") or {}
    nxt = catalog.get("next_event") or {}

    top = rank_players(players, horizon=horizon, risk=risk, min_minutes=180, limit=15)
    diffs = [p for p in rank_players(players, horizon=horizon, risk="aggressive", min_minutes=180, limit=40) if p["is_differential"]][
        :8
    ]

    news = build_news_report(
        players,
        squad=squad_data["picks"] if squad_data else None,
        update_snapshot=True,
    )

    result: dict[str, Any] = {
        "gameweek": {
            "current": cur.get("id"),
            "next": nxt.get("id"),
            "deadline": (nxt or cur).get("deadline_time"),
            "name": (nxt or cur).get("name"),
        },
        "risk_mode": risk,
        "top_assets": top,
        "differentials": diffs,
        "news": news,
        "actions": [],
    }

    if not squad_data:
        result["actions"] = [
            "Set config.json entry_id to analyze YOUR squad.",
            "Until then: shortlist from top_assets, prefer minutes-secure players, check news before locking.",
            "Captain from the highest ep_next + minutes-confidence shortlist among players you own.",
            "Run: python -m fpl_agent --refresh news",
        ]
        return result

    captains = captain_shortlist(squad_data["picks"], horizon=min(3, horizon), risk=risk)
    transfers = transfer_ideas(
        players,
        squad_data["picks"],
        bank=squad_data.get("bank") or 0.0,
        free_transfers=free_transfers,
        horizon=horizon,
        risk=risk,
    )

    actions: list[str] = []
    # Priority order from research: availability → problems → transfers → captain → chips
    squad_flags = news.get("squad_flags") or []
    club_moves = news.get("club_moves_since_last_run") or []
    if club_moves:
        mv = ", ".join(f"{m['web_name']} ({m['from_team']}->{m['to_team']})" for m in club_moves[:4])
        actions.append(f"0) Club transfers FPL just reflected: {mv}.")
    if squad_flags:
        bits = []
        for f in squad_flags[:4]:
            bits.append(f"{f['web_name']} [{f['status_label']}] {f.get('news') or ''}".strip())
        actions.append("1) Availability first: " + "; ".join(bits))
    else:
        actions.append("1) Availability: no major flags in squad — re-check pressers near deadline.")

    if transfers["ideas"] and transfers["ideas"][0]["worthwhile"]:
        best = transfers["ideas"][0]
        actions.append(
            f"2) Transfer: {best['out']['web_name']} -> {best['in']['web_name']} "
            f"(delta {best['delta']:+.2f}{', -4 hit' if best['hit_cost'] else ', free'}). {best['reason']}."
        )
    else:
        actions.append("2) Transfers: HOLD — no move clears the edge-after-hit bar. Bank FT if possible.")

    if captains:
        c1, c2 = captains[0], captains[1] if len(captains) > 1 else None
        eo_note = ""
        if c2 and abs(c1["score"] - c2["score"]) < 1.2 and (c2.get("eo_proxy") or 100) + 15 < (c1.get("eo_proxy") or 0):
            eo_note = f" Close scores: consider {c2['web_name']} for lower EO upside."
        actions.append(
            f"3) Captain: {c1['web_name']} (score {c1['score']}, ep_next {c1.get('ep_next')}, "
            f"own% {c1.get('ownership')}). Vice: {c2['web_name'] if c2 else 'n/a'}.{eo_note}"
        )

    chips = squad_data.get("chips") or []
    used = {c.get("name") for c in chips}
    actions.append(
        f"4) Chips: used={sorted(used) or ['none']}. Only arm TC/BB/FH/WC when fixtures + minutes align — don't force."
    )
    actions.append("5) Deadline: wait for confirmed lineups / press conferences when rotation risk is high.")

    result["squad"] = {
        "name": squad_data.get("name"),
        "team_name": squad_data.get("team_name"),
        "overall_rank": squad_data.get("overall_rank"),
        "bank": squad_data.get("bank"),
        "team_value": squad_data.get("team_value"),
        "event_id": squad_data.get("event_id"),
    }
    result["captain_shortlist"] = captains
    result["transfers"] = transfers
    result["actions"] = actions
    return result
