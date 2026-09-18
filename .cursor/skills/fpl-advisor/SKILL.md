---
name: fpl-advisor
description: >-
  Advises on Fantasy Premier League (FPL / PL fantasy) using live official API
  data and a research-backed decision framework. Use when the user asks about
  FPL transfers, captaincy, differentials, chips, fixtures, squad review,
  gameweek planning, or "what should I do next" for Fantasy Premier League.
---

# FPL Advisor

## When to use

Apply this skill for any Fantasy Premier League question: transfers, captain, vice, differentials, wildcard/free hit/bench boost/triple captain, price changes, fixture runs, or weekly "what to do next".

## Always run live data first

From the project root (`fpl-agent`), **prefer `--refresh`** so injuries/transfers are not stale cache:

```bash
python -m fpl_agent --refresh news
python -m fpl_agent --refresh next
python -m fpl_agent next --json
python -m fpl_agent players --pos MID --limit 15
python -m fpl_agent differentials
python -m fpl_agent captain
python -m fpl_agent transfers --ft 1
python -m fpl_agent squad
```

`news` always bypasses cache. It reports:
- **Club moves** detected since the last snapshot (FPL team-id changes, e.g. Guéhi → MCI)
- **Your squad flags** (status, chance %, official news text, scout links)
- **Recent market injuries/doubts** from official FPL `news` / `news_added`

If `config.json` has a real `entry_id`, squad-aware advice is required. If missing, ask for the entry id (from `fantasy.premierleague.com/entry/{id}/`) and still give market-level advice.

## Freshness rules

1. Never invent injuries, lineups, or club transfers from model memory.
2. Before advising, run `news` (or `next`, which embeds the news block).
3. Treat official FPL `status` / `news` / `chance_of_playing_*` as primary.
4. When `scout_news_link` is present, cite it for press-conference detail.
5. Club transfers are only "known" once FPL updates the player's `team` in bootstrap — the snapshot diff surfaces that.

## Decision order (do not skip)

1. **Availability / minutes** — status, news, `chance_of_playing`, rotation risk
2. **Fix problems** — injured/suspended/locked-out before shiny upgrades
3. **Transfers** — multi-GW outlook; only take a **-4** if projected net gain clearly exceeds 4
4. **Captain / vice** — from the user's squad; minutes confidence > ~75%
5. **Chips** — never force; align with blanks/doubles and confirmed minutes
6. **Deadline** — wait for pressers when rotation risk is high

## Scoring signals that actually help

Prioritize these over vibes or last week's haul alone:

| Signal | Why |
|--------|-----|
| Official `ep_next` / `ep_this` | FPL's own expected-points proxy |
| Minutes probability | Hauls require starts |
| xG / xA / xGI and per-90 | Forward-looking vs raw points |
| FDR next 3–5 GWs | Home/away difficulty from fixtures |
| Set pieces / pens (`penalties_order`, corners) | Ceiling |
| Ownership % | Template vs differential framing — **not** quality |
| Defensive contribution (DEF/GKP) | Relevant under newer scoring |

### Captain framework

1. Shortlist 2–4 squad players by blended score (EP + minutes + fixtures + underlying)
2. Prefer minutes-secure options
3. If top two scores are within ~1–1.5 and the lower-owned option is credible, mention EO upside
4. Pick vice independently (different kickoff / lower blank risk when possible)

### Differential framework

A differential needs **low ownership AND** supporting underlying (xGI/90, role, fixtures). Low ownership alone is not an edge.

### Transfer hit rule

Recommend a hit only when the move's edge is clearly larger than the hit cost. Otherwise: **HOLD / roll FT**.

## Response template

Use this shape unless the user asks for something narrower:

```markdown
## What to do next
1. Availability: ...
2. Transfers: HOLD or Out → In (why, hit?)
3. Captain / Vice: ...
4. Watch / deadline note: ...

## Why
- Bullets tied to minutes, EP/xGI, fixtures, ownership

## Risks
- Injuries, rotation, price locks, blank/double context
```

Be decisive. Give a primary plan and one alternative. Do not dump giant player lists unless asked.

## Extra reference

For API endpoints and field notes, see [reference.md](reference.md).
