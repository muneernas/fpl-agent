"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { AnalyzeResult, RiskMode, ScoredPlayer } from "@/lib/fpl/types";

const STORAGE_KEY = "nextgw-entry-id";

function fxLine(p: ScoredPlayer, n = 3) {
  return (p.next_fixtures || [])
    .slice(0, n)
    .map(
      (f) =>
        `${f.opponent}(${f.is_home ? "H" : "A"},FDR${f.difficulty})`,
    )
    .join(" · ");
}

export function AppShell() {
  const [entryId, setEntryId] = useState("");
  const [risk, setRisk] = useState<RiskMode>("balanced");
  const [ft, setFt] = useState(1);
  const [data, setData] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setEntryId(saved);
  }, []);

  const deadlineLabel = useMemo(() => {
    if (!data?.gameweek?.deadline) return null;
    try {
      return new Date(data.gameweek.deadline).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return data.gameweek.deadline;
    }
  }, [data]);

  function runAnalyze(id = entryId) {
    const num = Number(id.trim());
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid FPL entry ID from your team URL.");
      return;
    }
    setError(null);
    localStorage.setItem(STORAGE_KEY, String(num));
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/analyze?entryId=${num}&risk=${risk}&ft=${ft}&horizon=5`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        setData(json);
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="page">
      <div className="pitch-glow" aria-hidden />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">NEXTGW</span>
          <span className="brand-sub">FPL what-to-do-next</span>
        </div>
        {data?.gameweek?.next ? (
          <div className="gw-chip">
            GW{data.gameweek.next}
            {deadlineLabel ? ` · ${deadlineLabel}` : ""}
          </div>
        ) : null}
      </header>

      <section className="hero">
        <h1 className="hero-title">
          Your next move,
          <br />
          not the template.
        </h1>
        <p className="hero-copy">
          Live official FPL data. Minutes first, then transfers, then captain —
          tuned for climbing, not copying Copilot.
        </p>

        <form
          className="hero-form"
          onSubmit={(e) => {
            e.preventDefault();
            runAnalyze();
          }}
        >
          <label className="field">
            <span>FPL entry ID</span>
            <input
              inputMode="numeric"
              placeholder="e.g. 8682977"
              value={entryId}
              onChange={(e) => setEntryId(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="field narrow">
            <span>Risk</span>
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value as RiskMode)}
            >
              <option value="safe">Safe</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </label>
          <label className="field narrow">
            <span>Free transfers</span>
            <select
              value={ft}
              onChange={(e) => setFt(Number(e.target.value))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={0}>0 (hit)</option>
            </select>
          </label>
          <button className="cta" type="submit" disabled={pending}>
            {pending ? "Reading pitch…" : "What should I do next?"}
          </button>
        </form>
        <p className="hint">
          Find your ID in{" "}
          <code>fantasy.premierleague.com/entry/XXXXXX/</code>
        </p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      {data ? (
        <main className="results">
          {data.squad ? (
            <p className="manager-line">
              <strong>{data.squad.name}</strong> · {data.squad.team_name} · OR{" "}
              {data.squad.overall_rank?.toLocaleString() ?? "—"} · £
              {data.squad.team_value}m · bank £{data.squad.bank}m
            </p>
          ) : null}

          <section className="block">
            <h2>Do this next</h2>
            <ol className="actions">
              {data.actions.map((a) => (
                <li key={a}>{a.replace(/^\d+\)\s*/, "")}</li>
              ))}
            </ol>
          </section>

          {data.news.squad_flags.length > 0 ? (
            <section className="block">
              <h2>Squad news</h2>
              <ul className="news-list">
                {data.news.squad_flags.map((f) => (
                  <li key={`${f.web_name}-${f.status}`}>
                    <span className={`tag tag-${f.status}`}>
                      {f.status_label}
                    </span>
                    <strong>{f.web_name}</strong> ({f.team}) · chance{" "}
                    {f.chance_next ?? "—"}%
                    <div className="muted">{f.news || "—"}</div>
                    {f.scout_news_link ? (
                      <a
                        href={f.scout_news_link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Team news link
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.transfers?.ideas?.length ? (
            <section className="block">
              <h2>Transfer ideas</h2>
              <ul className="transfer-list">
                {data.transfers.ideas.slice(0, 5).map((idea) => (
                  <li key={`${idea.out.id}-${idea.in.id}`}>
                    <span className={idea.worthwhile ? "go" : "weak"}>
                      {idea.worthwhile ? "GO" : "weak"}
                    </span>
                    <span>
                      {idea.out.web_name} → {idea.in.web_name}
                    </span>
                    <span className="muted">
                      Δ{idea.delta >= 0 ? "+" : ""}
                      {idea.delta.toFixed(2)} · hit {idea.hit_cost}
                    </span>
                    <div className="muted">{idea.reason}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="block">
            <h2>Captain shortlist</h2>
            <div className="player-grid">
              {data.captain_shortlist.map((p, i) => (
                <article key={p.id} className="player-row">
                  <span className="rank">{i + 1}</span>
                  <div>
                    <strong>
                      {p.web_name}{" "}
                      <span className="muted">
                        {p.team} {p.position}
                      </span>
                    </strong>
                    <div className="muted">
                      score {p.score.toFixed(2)} · ep {p.ep_next} · own%{" "}
                      {p.ownership} · {fxLine(p)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="block twin">
            <div>
              <h2>Top assets</h2>
              <div className="player-grid compact">
                {data.top_assets.slice(0, 8).map((p, i) => (
                  <article key={p.id} className="player-row">
                    <span className="rank">{i + 1}</span>
                    <div>
                      <strong>
                        {p.web_name}{" "}
                        <span className="muted">
                          {p.team} £{p.cost.toFixed(1)}
                        </span>
                      </strong>
                      <div className="muted">
                        {p.score.toFixed(2)} · xGI90 {p.xgi90.toFixed(2)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div>
              <h2>Differentials</h2>
              <div className="player-grid compact">
                {data.differentials.slice(0, 8).map((p, i) => (
                  <article key={p.id} className="player-row">
                    <span className="rank">{i + 1}</span>
                    <div>
                      <strong>
                        {p.web_name}{" "}
                        <span className="muted">
                          {p.team} {p.ownership}%
                        </span>
                      </strong>
                      <div className="muted">score {p.score.toFixed(2)}</div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </main>
      ) : null}

      <footer className="foot">
        Unofficial tool using the public FPL API. Not affiliated with the
        Premier League. Advice is probabilistic — you still pick the team.
      </footer>
    </div>
  );
}
