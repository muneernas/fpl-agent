# FPL API & signal reference

Base URL: `https://fantasy.premierleague.com/api/` (public, read-only, no key).

## Core endpoints

| Path | Use |
|------|-----|
| `/bootstrap-static/` | Players (`elements`), teams, events, chips, element_types |
| `/fixtures/` or `/fixtures/?event={gw}` | FDR (`team_h_difficulty` / `team_a_difficulty`), kickoffs |
| `/element-summary/{id}/` | Per-player history + remaining fixtures |
| `/entry/{id}/` | Manager profile, rank, bank/value at last deadline |
| `/entry/{id}/event/{gw}/picks/` | Squad, captain flags, active chip |
| `/entry/{id}/history/` | Season GW history + chips used |
| `/entry/{id}/transfers/` | Transfer log |
| `/event/{gw}/live/` | Live points / bonus |
| `/team/set-piece-notes/` | Set-piece notes when available |

## Useful player fields

- Availability: `status`, `chance_of_playing_next_round`, `chance_of_playing_this_round`, `news`, `news_added`, `scout_news_link`
- Expected points: `ep_this`, `ep_next`
- Underlying: `expected_goals`, `expected_assists`, `expected_goal_involvements`, `*_per_90`
- Popularity: `selected_by_percent`, `transfers_in_event`, `transfers_out_event`
- Set pieces: `penalties_order`, `corners_and_indirect_freekicks_order`, `direct_freekicks_order`
- Value/form: `form`, `points_per_game`, `value_form`, `ict_index`
- Newer defensive signal: `defensive_contribution`, `defensive_contribution_per_90`

## Keeping injuries & club transfers fresh

There is no separate public Premier League "player transfers API". FPL updates each player's `team` in `/bootstrap-static/` when the game reflects a move (e.g. Guéhi → MCI).

This project:
1. Reads live bootstrap (`news` always bypasses cache; use `--refresh` elsewhere)
2. Snapshots `player id -> team` under `data/snapshots/player_teams.json`
3. Diffs snapshots to announce club moves between runs
4. Surfaces injury/doubt text from official `news` + `news_added`

Optional human cross-check near deadline: Fantasy Football Scout injury page, or club pages via `scout_news_link`. Do not scrape paywalled sites by default.

## Research principles encoded in this project

- Captaincy: expected points + minutes first; EO matters when scores are close
- Differentials: ownership gap only counts with real underlying + role + fixtures
- Process: availability → problems → transfers → captain → chips → deadline patience
- Hits: transfers are scarce; -4 needs clear net positive expectation

## Project commands

```bash
pip install -r requirements.txt
pip install -e .
copy config.example.json config.json
python -m fpl_agent --refresh news
python -m fpl_agent --refresh next --json
```
