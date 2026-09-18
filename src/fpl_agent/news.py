"""Live injury / availability news and club-transfer detection.

Source of truth: official FPL bootstrap-static fields
(`status`, `news`, `news_added`, chance_of_playing_*, scout_news_link).

Club moves are detected by snapshotting each player's FPL team id between runs
(e.g. Guéhi MCI) so the agent notices transfers as soon as FPL updates them.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SNAPSHOT_PATH = Path(__file__).resolve().parents[2] / "data" / "snapshots" / "player_teams.json"

STATUS_LABEL = {
    "a": "available",
    "d": "doubtful",
    "i": "injured",
    "s": "suspended",
    "u": "unavailable",
    "n": "not-in-squad / left club",
}


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _age_hours(news_added: str | None) -> float | None:
    ts = _parse_ts(news_added)
    if not ts:
        return None
    return (datetime.now(timezone.utc) - ts).total_seconds() / 3600.0


def load_team_snapshot() -> dict[str, Any]:
    if not SNAPSHOT_PATH.exists():
        return {"players": {}}
    try:
        return json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"players": {}}


def save_team_snapshot(players: list[dict[str, Any]]) -> Path:
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "players": {
            str(p["id"]): {
                "web_name": p.get("web_name"),
                "team_id": p.get("team_id"),
                "team": p.get("team"),
                "position": p.get("position"),
            }
            for p in players
        },
    }
    SNAPSHOT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return SNAPSHOT_PATH


def detect_club_moves(players: list[dict[str, Any]]) -> list[dict[str, Any]]:
    prev = load_team_snapshot().get("players") or {}
    moves: list[dict[str, Any]] = []
    for p in players:
        key = str(p["id"])
        old = prev.get(key)
        if not old:
            continue
        if old.get("team_id") != p.get("team_id"):
            moves.append(
                {
                    "id": p["id"],
                    "web_name": p.get("web_name"),
                    "from_team": old.get("team"),
                    "to_team": p.get("team"),
                    "position": p.get("position"),
                    "status": p.get("status"),
                    "news": p.get("news") or "",
                }
            )
    return moves


def injury_feed(
    players: list[dict[str, Any]],
    *,
    owned_ids: set[int] | None = None,
    max_age_hours: float | None = 96.0,
    limit: int = 40,
) -> list[dict[str, Any]]:
    """Players who are not fully available, or have recent FPL news text."""
    rows: list[dict[str, Any]] = []
    for p in players:
        status = p.get("status") or "a"
        news = (p.get("news") or "").strip()
        age = _age_hours(p.get("news_added"))
        if status == "a" and not news:
            continue
        # Drop stale "available but old news string" noise
        if status == "a" and max_age_hours is not None and (age is None or age > max_age_hours):
            continue
        if status != "a" and max_age_hours is not None and age is not None and age > max_age_hours * 2:
            # keep long-term injured, but deprioritize later via sort
            pass

        rows.append(
            {
                "id": p["id"],
                "web_name": p.get("web_name"),
                "team": p.get("team"),
                "position": p.get("position"),
                "status": status,
                "status_label": STATUS_LABEL.get(status, status),
                "chance_next": p.get("chance_next"),
                "chance_this": p.get("chance_this"),
                "news": news,
                "news_added": p.get("news_added"),
                "age_hours": None if age is None else round(age, 1),
                "scout_news_link": p.get("scout_news_link") or "",
                "owned": bool(owned_ids and p["id"] in owned_ids),
                "ep_next": p.get("ep_next"),
                "ownership": p.get("ownership"),
            }
        )

    def sort_key(r: dict[str, Any]) -> tuple:
        severity = {"i": 0, "s": 1, "u": 1, "n": 2, "d": 3, "a": 4}.get(r["status"], 5)
        owned = 0 if r["owned"] else 1
        age = r["age_hours"] if r["age_hours"] is not None else 9999
        return (owned, severity, age)

    rows.sort(key=sort_key)
    return rows[:limit]


def squad_availability(squad: list[dict[str, Any]]) -> list[dict[str, Any]]:
    flagged = []
    for p in squad:
        status = p.get("status") or "a"
        news = (p.get("news") or "").strip()
        chance = p.get("chance_next")
        if status != "a" or news or (chance is not None and chance < 100):
            flagged.append(
                {
                    "web_name": p.get("web_name"),
                    "team": p.get("team"),
                    "position": p.get("position"),
                    "status": status,
                    "status_label": STATUS_LABEL.get(status, status),
                    "chance_next": chance,
                    "news": news,
                    "news_added": p.get("news_added"),
                    "age_hours": _age_hours(p.get("news_added")),
                    "scout_news_link": p.get("scout_news_link") or "",
                }
            )
    flagged.sort(key=lambda r: (0 if r["status"] != "a" else 1, r.get("chance_next") or 100))
    return flagged


def build_news_report(
    players: list[dict[str, Any]],
    *,
    squad: list[dict[str, Any]] | None = None,
    update_snapshot: bool = True,
) -> dict[str, Any]:
    owned_ids = {p["id"] for p in squad} if squad else None
    moves = detect_club_moves(players)
    if update_snapshot:
        save_team_snapshot(players)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "https://fantasy.premierleague.com/api/bootstrap-static/",
        "club_moves_since_last_run": moves,
        "squad_flags": squad_availability(squad) if squad else [],
        "recent_injuries": injury_feed(
            players,
            owned_ids=owned_ids,
            max_age_hours=96.0,
            limit=30,
        ),
        "notes": [
            "Club transfers appear here once FPL moves the player to the new team id.",
            "Injury text is FPL editorial news (same feed as the official site).",
            "For press-conference nuance near deadline, open scout_news_link when present.",
        ],
    }


def print_news_report(report: dict[str, Any]) -> None:
    print("\n========== FPL NEWS / INJURIES / CLUB MOVES ==========")
    print(f"Generated: {report.get('generated_at')}")
    print(f"Source: {report.get('source')}")

    moves = report.get("club_moves_since_last_run") or []
    print("\n--- Club moves detected since last refresh ---")
    if not moves:
        print("(none since last snapshot — first run only seeds the baseline)")
    else:
        for m in moves:
            print(
                f"- {m['web_name']}: {m['from_team']} -> {m['to_team']} "
                f"({m.get('position')}, status={m.get('status')})"
            )

    flags = report.get("squad_flags") or []
    print("\n--- Your squad availability ---")
    if not flags:
        print("(no flags)" if "squad_flags" in report else "(squad not loaded)")
    else:
        for f in flags:
            link = f" | {f['scout_news_link']}" if f.get("scout_news_link") else ""
            print(
                f"- {f['web_name']} ({f['team']}) [{f['status_label']}] "
                f"chance={f.get('chance_next')} | {f.get('news') or '-'}{link}"
            )

    print("\n--- Recent market news (injuries / doubts) ---")
    for r in report.get("recent_injuries") or []:
        own = " OWN" if r.get("owned") else ""
        age = f"{r['age_hours']}h" if r.get("age_hours") is not None else "?"
        print(
            f"-{own} {r['web_name']:<14} {r['team']:<4} [{r['status_label']:<11}] "
            f"{age:>6}  chance={r.get('chance_next')}  {r.get('news') or '-'}"
        )
    print("\n=====================================================\n")
