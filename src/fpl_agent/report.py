"""Pretty-print analysis for terminal + agent consumption."""

from __future__ import annotations

import json
from typing import Any


def _fx(player: dict[str, Any], n: int = 3) -> str:
    bits = []
    for f in (player.get("next_fixtures") or [])[:n]:
        ha = "H" if f.get("is_home") else "A"
        bits.append(f"{f.get('opponent')}({ha},FDR{f.get('difficulty')})")
    return ", ".join(bits) or "-"


def format_player_row(p: dict[str, Any]) -> str:
    flags = ",".join(p.get("risk_flags") or []) or "-"
    name = str(p.get("web_name", "?")).encode("ascii", "replace").decode("ascii")
    return (
        f"{name:<14} {p.get('team', '?'):<4} {p.get('position', '?'):<3} "
        f"GBP{p.get('cost', 0):4.1f}  score={p.get('score', 0):5.2f}  ep={p.get('ep_next', 0):4.1f}  "
        f"form={p.get('form', 0):4.1f}  xGI90={p.get('xgi90', 0):4.2f}  own%={p.get('ownership', 0):5.1f}  "
        f"minsF={p.get('minutes_factor', 1):4.2f}  fx[{_fx(p)}]  {flags}"
    )


def print_table(title: str, players: list[dict[str, Any]]) -> None:
    print(f"\n=== {title} ===")
    if not players:
        print("(none)")
        return
    for i, p in enumerate(players, 1):
        print(f"{i:2d}. {format_player_row(p)}")


def print_next_report(report: dict[str, Any]) -> None:
    gw = report.get("gameweek") or {}
    print("\n========== FPL - WHAT TO DO NEXT ==========")
    print(f"GW: current={gw.get('current')} next={gw.get('next')}  deadline={gw.get('deadline')}")
    print(f"Risk mode: {report.get('risk_mode')}")
    if report.get("squad"):
        s = report["squad"]
        print(
            f"Manager: {s.get('name')} ({s.get('team_name')})  "
            f"OR={s.get('overall_rank')}  GBP{s.get('team_value')}m  bank GBP{s.get('bank')}m"
        )

    news = report.get("news") or {}
    if news.get("squad_flags") or news.get("club_moves_since_last_run"):
        print("\n--- Live news (official FPL) ---")
        for m in news.get("club_moves_since_last_run") or []:
            print(f"MOVE: {m['web_name']} {m['from_team']} -> {m['to_team']}")
        for f in news.get("squad_flags") or []:
            print(
                f"FLAG: {f['web_name']} [{f['status_label']}] "
                f"chance={f.get('chance_next')} | {f.get('news') or '-'}"
            )

    print("\n--- Priority actions ---")
    for a in report.get("actions") or []:
        print(a)

    if report.get("captain_shortlist"):
        print_table("Captain shortlist (your squad)", report["captain_shortlist"])

    transfers = report.get("transfers") or {}
    if transfers.get("ideas"):
        print("\n=== Transfer ideas ===")
        for i, idea in enumerate(transfers["ideas"], 1):
            mark = "GO" if idea["worthwhile"] else "weak"
            print(
                f"{i:2d}. [{mark}] {idea['out']['web_name']} -> {idea['in']['web_name']}  "
                f"delta={idea['delta']:+.2f}  hit={idea['hit_cost']}  | {idea['reason']}"
            )
    elif "transfers" in report:
        print("\n=== Transfer ideas ===\n(none strong enough)")

    print_table("Top assets (market)", report.get("top_assets") or [])
    print_table("Differentials (low own% + real score)", report.get("differentials") or [])
    print("\n===========================================\n")


def dump_json(data: Any) -> None:
    print(json.dumps(data, indent=2, default=str))
