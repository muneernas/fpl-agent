"""CLI for the FPL advisor agent."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .api import FplApi
from .catalog import build_catalog, load_squad
from .news import build_news_report, print_news_report
from .report import dump_json, print_next_report, print_table
from .scoring import captain_shortlist, rank_players, score_player, transfer_ideas, what_to_do_next

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "config.json"


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {}
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="fpl-agent",
        description="Premier League Fantasy advisor — live FPL API + research-backed decisions.",
    )
    p.add_argument("--json", action="store_true", help="Emit JSON instead of tables")
    p.add_argument("--risk", choices=["safe", "balanced", "aggressive"], default=None)
    p.add_argument("--horizon", type=int, default=None, help="Fixture horizon in gameweeks (3–8)")
    p.add_argument("--entry", type=int, default=None, help="Override FPL entry/team id")
    p.add_argument("--refresh", action="store_true", help="Bypass cache for this run")

    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("next", help="What to do next (availability → transfers → captain)")
    sub.add_parser("captain", help="Captain shortlist from your squad")
    t = sub.add_parser("transfers", help="Transfer ideas for your squad")
    t.add_argument("--ft", type=int, default=None, help="Free transfers available")

    pl = sub.add_parser("players", help="Rank market players")
    pl.add_argument("--pos", choices=["GKP", "DEF", "MID", "FWD"], default=None)
    pl.add_argument("--limit", type=int, default=20)
    sub.add_parser("differentials", help="Low-ownership players with real underlying support")
    sub.add_parser("squad", help="Show your current squad with scores")
    sub.add_parser("deadline", help="Show current/next GW deadline info")
    n = sub.add_parser("news", help="Live injuries, availability flags, and club moves")
    n.add_argument("--all", action="store_true", help="Show wider market news, not just recent")

    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            pass

    args = parse_args(argv)
    cfg = load_config()
    risk = args.risk or cfg.get("risk_mode") or "balanced"
    horizon = args.horizon or int(cfg.get("horizon_gws") or 5)
    entry_id = args.entry or cfg.get("entry_id")
    free_transfers = int(cfg.get("free_transfers") or 1)

    api = FplApi(cache_ttl=0 if (args.refresh or args.cmd == "news") else 600)
    catalog = build_catalog(api)

    squad_data = None
    if entry_id and entry_id != 1234567:
        try:
            squad_data = load_squad(api, int(entry_id), catalog)
        except Exception as exc:  # noqa: BLE001 — surface API/config issues cleanly
            print(f"Warning: could not load squad for entry_id={entry_id}: {exc}", file=sys.stderr)

    if args.cmd == "news":
        report = build_news_report(
            catalog["players"],
            squad=squad_data["picks"] if squad_data else None,
            update_snapshot=True,
        )
        if getattr(args, "all", False):
            from .news import injury_feed

            report["recent_injuries"] = injury_feed(
                catalog["players"],
                owned_ids={p["id"] for p in squad_data["picks"]} if squad_data else None,
                max_age_hours=None,
                limit=80,
            )
        if args.json:
            dump_json(report)
        else:
            print_news_report(report)
        return 0

    if args.cmd == "deadline":
        cur, nxt = catalog.get("current_event"), catalog.get("next_event")
        payload = {"current": cur, "next": nxt}
        if args.json:
            dump_json(payload)
        else:
            print(f"Current: {cur and cur.get('name')} (id={cur and cur.get('id')})")
            print(f"Next:    {nxt and nxt.get('name')} (id={nxt and nxt.get('id')})")
            print(f"Deadline (next): {(nxt or cur or {}).get('deadline_time')}")
        return 0

    if args.cmd == "players":
        ranked = rank_players(
            catalog["players"],
            position=args.pos,
            horizon=horizon,
            risk=risk,
            min_minutes=90,
            limit=args.limit,
        )
        if args.json:
            dump_json(ranked)
        else:
            print_table(f"Top players ({args.pos or 'ALL'})", ranked)
        return 0

    if args.cmd == "differentials":
        ranked = rank_players(catalog["players"], horizon=horizon, risk="aggressive", min_minutes=180, limit=50)
        diffs = [p for p in ranked if p.get("is_differential")][:20]
        if args.json:
            dump_json(diffs)
        else:
            print_table("Differentials", diffs)
        return 0

    if args.cmd in {"next", "captain", "transfers", "squad"} and squad_data is None:
        if args.cmd == "next":
            report = what_to_do_next(catalog, None, horizon=horizon, risk=risk, free_transfers=free_transfers)
            if args.json:
                dump_json(report)
            else:
                print_next_report(report)
                print("Tip: copy config.example.json -> config.json and set your entry_id.")
            return 0
        print(
            "Squad commands need config.json with a real entry_id "
            "(from fantasy.premierleague.com/entry/{id}/).",
            file=sys.stderr,
        )
        return 2

    assert squad_data is not None

    if args.cmd == "squad":
        scored = [score_player(p, horizon=horizon, risk=risk) for p in squad_data["picks"]]
        scored.sort(key=lambda x: (0 if (x.get("multiplier") or 0) else 1, -x["score"]))
        if args.json:
            dump_json({"squad": squad_data["entry"], "picks": scored})
        else:
            print(
                f"{squad_data['name']} | {squad_data['team_name']} | "
                f"OR {squad_data['overall_rank']} | bank GBP{squad_data['bank']}m"
            )
            print_table(f"Squad (GW {squad_data['event_id']})", scored)
        return 0

    if args.cmd == "captain":
        caps = captain_shortlist(squad_data["picks"], horizon=min(3, horizon), risk=risk)
        if args.json:
            dump_json(caps)
        else:
            print_table("Captain shortlist", caps)
        return 0

    if args.cmd == "transfers":
        ft = args.ft if args.ft is not None else free_transfers
        ideas = transfer_ideas(
            catalog["players"],
            squad_data["picks"],
            bank=squad_data.get("bank") or 0.0,
            free_transfers=ft,
            horizon=horizon,
            risk=risk,
        )
        if args.json:
            dump_json(ideas)
        else:
            print_table("Weak links", ideas["weak_links"])
            print("\n=== Ideas ===")
            for i, idea in enumerate(ideas["ideas"], 1):
                mark = "GO" if idea["worthwhile"] else "weak"
                print(
                    f"{i:2d}. [{mark}] {idea['out']['web_name']} -> {idea['in']['web_name']}  "
                    f"delta={idea['delta']:+.2f} hit={idea['hit_cost']} | {idea['reason']}"
                )
            if ideas.get("hold_recommendation"):
                print("\nRecommendation: HOLD / roll free transfer.")
        return 0

    if args.cmd == "next":
        ft = free_transfers
        if hasattr(args, "ft") and args.ft is not None:
            ft = args.ft
        report = what_to_do_next(
            catalog,
            squad_data,
            horizon=horizon,
            risk=risk,
            free_transfers=ft,
        )
        if args.json:
            dump_json(report)
        else:
            print_next_report(report)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
