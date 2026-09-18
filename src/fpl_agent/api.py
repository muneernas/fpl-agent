"""Official Fantasy Premier League API client (read-only, no auth)."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import requests

BASE = "https://fantasy.premierleague.com/api"
CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "cache"
DEFAULT_TTL = 600  # seconds


class FplApi:
    def __init__(self, cache_ttl: int = DEFAULT_TTL, session: requests.Session | None = None):
        self.cache_ttl = cache_ttl
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "fpl-agent/0.1 (personal research; +https://github.com/local/fpl-agent)",
                "Accept": "application/json",
            }
        )
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, key: str) -> Path:
        safe = key.replace("/", "_").replace("?", "_")
        return CACHE_DIR / f"{safe}.json"

    def _get(self, path: str, *, use_cache: bool = True) -> Any:
        cache_path = self._cache_path(path)
        if use_cache and cache_path.exists():
            age = time.time() - cache_path.stat().st_mtime
            if age < self.cache_ttl:
                return json.loads(cache_path.read_text(encoding="utf-8"))

        url = f"{BASE}{path}"
        resp = self.session.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        cache_path.write_text(json.dumps(data), encoding="utf-8")
        return data

    def bootstrap(self) -> dict[str, Any]:
        return self._get("/bootstrap-static/")

    def fixtures(self, event: int | None = None) -> list[dict[str, Any]]:
        path = f"/fixtures/?event={event}" if event is not None else "/fixtures/"
        return self._get(path)

    def element_summary(self, element_id: int) -> dict[str, Any]:
        return self._get(f"/element-summary/{element_id}/")

    def entry(self, entry_id: int) -> dict[str, Any]:
        return self._get(f"/entry/{entry_id}/")

    def entry_history(self, entry_id: int) -> dict[str, Any]:
        return self._get(f"/entry/{entry_id}/history/")

    def entry_picks(self, entry_id: int, event: int) -> dict[str, Any]:
        return self._get(f"/entry/{entry_id}/event/{event}/picks/")

    def entry_transfers(self, entry_id: int) -> list[dict[str, Any]]:
        return self._get(f"/entry/{entry_id}/transfers/")

    def event_live(self, event: int) -> dict[str, Any]:
        return self._get(f"/event/{event}/live/")

    def event_status(self) -> dict[str, Any]:
        return self._get("/event-status/")

    def set_piece_notes(self) -> dict[str, Any]:
        return self._get("/team/set-piece-notes/")
