# fpl-agent

A Cursor-ready **Fantasy Premier League advisor**: live official FPL API data + a research-backed decision framework (minutes → transfers → captain → chips).

## Web UI (Vercel)

Shareable app for friends lives in `web/` (**NEXTGW**):

```bash
cd web
npm install
npm run dev
```

Deploy: import the repo on Vercel and set **Root Directory** to `web`. See `web/README.md`.

### Private EDGE (/admin)

Your personal desk lives at **`/admin`** on the same site (password via `EDGE_PASSWORD`).
Friends keep using `/`. Set Vercel env:

- `EDGE_PASSWORD` — required in production
- `EDGE_ENTRY_ID` — optional (defaults to your id in edge-config)
- `EDGE_RIVALS` — optional JSON array of `{ "label", "entry_id" }`

## Quick start (CLI / Cursor agent)

```bash
cd ~/Projects/fpl-agent
pip install -r requirements.txt
pip install -e .
copy config.example.json config.json
```

Edit `config.json` and set your **entry_id** (the number in `https://fantasy.premierleague.com/entry/{id}/`).

```bash
python -m fpl_agent --refresh news
python -m fpl_agent --refresh next
python -m fpl_agent players --pos MID --limit 15
python -m fpl_agent differentials
python -m fpl_agent captain
python -m fpl_agent transfers --ft 1
python -m fpl_agent squad
```

Add `--json` for machine-readable output (best when chatting with the Cursor agent).

## Fresh injuries & club transfers

- **Injuries/doubts** come from official FPL fields (`status`, `news`, `news_added`, chance %).
- **Club moves** (like Guéhi to City) are detected when FPL updates the player's team; the agent snapshots teams and diffs between runs.
- `news` always hits the live API (no stale cache).

## Cursor agent usage

Ask: "What should I do next for FPL?" / "Any injury news?" — the skill runs `news` + `next`.

## Notes

- Public FPL API, no key required. General responses cache under `data/cache/` (~10 min).
- Not affiliated with the Premier League / FPL. Personal research only.
