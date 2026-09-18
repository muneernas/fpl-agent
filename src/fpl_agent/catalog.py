"""Build a normalized player/fixture catalog from bootstrap + fixtures."""

from __future__ import annotations

from typing import Any

import requests

from .api import FplApi


POSITIONS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}


def _f(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def current_event(bootstrap: dict[str, Any]) -> dict[str, Any] | None:
    events = bootstrap.get("events") or []
    for e in events:
        if e.get("is_current"):
            return e
    for e in events:
        if e.get("is_next"):
            return e
    return events[0] if events else None


def next_event(bootstrap: dict[str, Any]) -> dict[str, Any] | None:
    events = bootstrap.get("events") or []
    for e in events:
        if e.get("is_next"):
            return e
    cur = current_event(bootstrap)
    if not cur:
        return None
    for e in events:
        if e.get("id", 0) == cur["id"] + 1:
            return e
    return None


def build_catalog(api: FplApi) -> dict[str, Any]:
    boot = api.bootstrap()
    fixtures = api.fixtures()
    teams = {t["id"]: t for t in boot.get("teams", [])}
    types = {t["id"]: t for t in boot.get("element_types", [])}
    cur = current_event(boot)
    nxt = next_event(boot)

    upcoming_by_team: dict[int, list[dict[str, Any]]] = {tid: [] for tid in teams}
    for fx in fixtures:
        if fx.get("finished") or fx.get("event") is None:
            continue
        event = fx["event"]
        if cur and event < cur["id"]:
            continue
        for side, opp, diff_key, home in (
            ("team_h", "team_a", "team_h_difficulty", True),
            ("team_a", "team_h", "team_a_difficulty", False),
        ):
            tid = fx[side]
            upcoming_by_team[tid].append(
                {
                    "event": event,
                    "opponent_id": fx[opp],
                    "opponent": teams.get(fx[opp], {}).get("short_name", "?"),
                    "difficulty": fx.get(diff_key, 3),
                    "is_home": home,
                    "kickoff_time": fx.get("kickoff_time"),
                }
            )

    for tid in upcoming_by_team:
        upcoming_by_team[tid].sort(key=lambda x: (x["event"], x.get("kickoff_time") or ""))

    players: list[dict[str, Any]] = []
    for el in boot.get("elements", []):
        if el.get("removed"):
            continue
        team_id = el["team"]
        upcoming = upcoming_by_team.get(team_id, [])[:8]
        next3 = upcoming[:3]
        next5 = upcoming[:5]
        avg_fdr_3 = sum(f["difficulty"] for f in next3) / len(next3) if next3 else 3.0
        avg_fdr_5 = sum(f["difficulty"] for f in next5) / len(next5) if next5 else 3.0

        status = el.get("status", "a")
        chance = el.get("chance_of_playing_next_round")
        if chance is None:
            chance = 100 if status == "a" else (75 if status == "d" else 0)

        xgi90 = _f(el.get("expected_goal_involvements_per_90"))
        xg90 = _f(el.get("expected_goals_per_90"))
        xa90 = _f(el.get("expected_assists_per_90"))
        ep_next = _f(el.get("ep_next"))
        ep_this = _f(el.get("ep_this"))
        form = _f(el.get("form"))
        ownership = _f(el.get("selected_by_percent"))
        cost = el.get("now_cost", 0) / 10.0
        minutes = el.get("minutes", 0) or 0
        starts = el.get("starts", 0) or 0

        players.append(
            {
                "id": el["id"],
                "web_name": el.get("web_name") or el.get("second_name"),
                "full_name": f"{el.get('first_name', '')} {el.get('second_name', '')}".strip(),
                "team_id": team_id,
                "team": teams.get(team_id, {}).get("short_name", "?"),
                "position": POSITIONS.get(el.get("element_type"), "?"),
                "position_id": el.get("element_type"),
                "cost": cost,
                "status": status,
                "news": el.get("news") or "",
                "news_added": el.get("news_added"),
                "scout_news_link": el.get("scout_news_link") or "",
                "chance_this": el.get("chance_of_playing_this_round"),
                "chance_next": chance,
                "minutes": minutes,
                "starts": starts,
                "form": form,
                "points_per_game": _f(el.get("points_per_game")),
                "total_points": el.get("total_points", 0) or 0,
                "ownership": ownership,
                "ep_this": ep_this,
                "ep_next": ep_next,
                "xg": _f(el.get("expected_goals")),
                "xa": _f(el.get("expected_assists")),
                "xgi": _f(el.get("expected_goal_involvements")),
                "xg90": xg90,
                "xa90": xa90,
                "xgi90": xgi90,
                "ict": _f(el.get("ict_index")),
                "bps": el.get("bps", 0) or 0,
                "influence": _f(el.get("influence")),
                "creativity": _f(el.get("creativity")),
                "threat": _f(el.get("threat")),
                "defensive_contribution": _f(el.get("defensive_contribution")),
                "defensive_contribution_per_90": _f(el.get("defensive_contribution_per_90")),
                "penalties_order": el.get("penalties_order"),
                "corners_order": el.get("corners_and_indirect_freekicks_order"),
                "direct_freekicks_order": el.get("direct_freekicks_order"),
                "transfers_in_event": el.get("transfers_in_event", 0) or 0,
                "transfers_out_event": el.get("transfers_out_event", 0) or 0,
                "value_form": _f(el.get("value_form")),
                "value_season": _f(el.get("value_season")),
                "avg_fdr_next3": round(avg_fdr_3, 2),
                "avg_fdr_next5": round(avg_fdr_5, 2),
                "next_fixtures": next5,
                "can_select": bool(el.get("can_select", True)),
            }
        )

    return {
        "bootstrap": boot,
        "current_event": cur,
        "next_event": nxt,
        "teams": teams,
        "types": types,
        "players": players,
        "fixtures": fixtures,
    }


def load_squad(api: FplApi, entry_id: int, catalog: dict[str, Any]) -> dict[str, Any]:
    entry = api.entry(entry_id)
    cur = catalog.get("current_event") or {}
    event_id = cur.get("id")
    if not event_id:
        raise RuntimeError("No current/next gameweek found in bootstrap data.")

    # Prefer current GW picks; if unavailable, try previous finished GW
    picks_payload: dict[str, Any] | None = None
    try:
        picks_payload = api.entry_picks(entry_id, event_id)
    except requests.HTTPError:
        picks_payload = None

    if picks_payload is None and event_id > 1:
        try:
            picks_payload = api.entry_picks(entry_id, event_id - 1)
            event_id = event_id - 1
        except requests.HTTPError as exc:
            raise RuntimeError(f"Could not load picks for entry {entry_id}") from exc

    if picks_payload is None:
        raise RuntimeError(f"Could not load picks for entry {entry_id}")

    by_id = {p["id"]: p for p in catalog["players"]}
    picks = []
    for pick in (picks_payload or {}).get("picks", []):
        base = by_id.get(pick["element"], {"id": pick["element"], "web_name": f"#{pick['element']}"})
        picks.append(
            {
                **base,
                "multiplier": pick.get("multiplier", 0),
                "is_captain": bool(pick.get("is_captain")),
                "is_vice_captain": bool(pick.get("is_vice_captain")),
                "position_slot": pick.get("position"),
                "selling_price": (pick.get("selling_price") or 0) / 10.0,
                "purchase_price": (pick.get("purchase_price") or 0) / 10.0,
            }
        )

    history = api.entry_history(entry_id)
    return {
        "entry": entry,
        "event_id": event_id,
        "picks": picks,
        "entry_history": (picks_payload or {}).get("entry_history"),
        "active_chip": (picks_payload or {}).get("active_chip"),
        "chips": history.get("chips", []),
        "current": history.get("current", []),
        "bank": (entry.get("last_deadline_bank") or 0) / 10.0,
        "team_value": (entry.get("last_deadline_value") or 0) / 10.0,
        "overall_rank": entry.get("summary_overall_rank"),
        "overall_points": entry.get("summary_overall_points"),
        "name": f"{entry.get('player_first_name', '')} {entry.get('player_last_name', '')}".strip(),
        "team_name": entry.get("name"),
    }
