# FPL Agent project rules

This repo is a **Fantasy Premier League advisor**. When the user asks about FPL, transfers, captains, injuries, or weekly plans:

1. Read and follow `.cursor/skills/fpl-advisor/SKILL.md`.
2. Run `python -m fpl_agent --refresh news` and/or `python -m fpl_agent --refresh next` before advising.
3. Prefer decisive "what to do next" answers using the skill's decision order.
4. Do not invent injuries, lineups, club transfers, or prices — use live API output / user-provided news.
5. Guéhi (and any other movers) are whatever team FPL currently lists — never override with memory.
