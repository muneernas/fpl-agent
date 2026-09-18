"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RiskMode } from "@/lib/fpl/types";

const STORAGE_KEY = "nextgw-entry-id";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "What should I do next?",
  "Who should I start?",
  "Who should I transfer?",
  "Who should I captain?",
  "Any injury news?",
  "Show differentials",
];

function renderMarkdownLite(text: string) {
  return text.split("\n").map((line, i) => {
    const html = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
    return (
      <p
        key={`${i}-${line.slice(0, 12)}`}
        dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
      />
    );
  });
}

export function AppShell() {
  const [entryId, setEntryId] = useState("");
  const [risk, setRisk] = useState<RiskMode>("balanced");
  const [ft, setFt] = useState(1);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I'm **NEXTGW**. Paste your FPL entry ID above, then ask anything — who to start, captain, transfers, injuries, or what to do next.",
    },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setEntryId(saved);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || pending) return;

    const num = Number(entryId.trim());
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid FPL entry ID first (from your team URL).");
      return;
    }

    setError(null);
    localStorage.setItem(STORAGE_KEY, String(num));
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setPending(true);

    try {
      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: num,
          message: text,
          risk,
          ft,
          history,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chat failed");

      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: json.reply as string,
        },
      ]);
      if (json.snapshot?.squad) {
        const s = json.snapshot.squad;
        const gw = json.snapshot.gameweek;
        setMeta(
          `${s.name} · ${s.team_name} · OR ${s.overall_rank?.toLocaleString?.() ?? s.overall_rank ?? "—"} · GW${gw?.next ?? gw?.current ?? "?"}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content:
            "Couldn't reach live FPL data just then. Check the entry ID and try again.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="page chat-page">
      <div className="pitch-glow" aria-hidden />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">NEXTGW</span>
          <span className="brand-sub">FPL chat advisor</span>
        </div>
        {meta ? <div className="gw-chip">{meta}</div> : null}
      </header>

      <section className="hero hero-compact">
        <h1 className="hero-title">Ask your squad.</h1>
        <p className="hero-copy">
          Live official FPL data in a chat — minutes first, then transfers,
          then captain.
        </p>

        <div className="hero-form setup-form">
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
            <select value={ft} onChange={(e) => setFt(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={0}>0 (hit)</option>
            </select>
          </label>
        </div>
        <p className="hint">
          ID from <code>fantasy.premierleague.com/entry/XXXXXX/</code>
        </p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="chat-shell" aria-label="FPL chat">
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              disabled={pending}
              onClick={() => void sendMessage(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="chat-window">
          <div className="chat-messages">
            {messages.map((m) => (
              <article
                key={m.id}
                className={`bubble ${m.role === "user" ? "bubble-user" : "bubble-ai"}`}
              >
                <span className="bubble-label">
                  {m.role === "user" ? "You" : "NEXTGW"}
                </span>
                <div className="bubble-body">{renderMarkdownLite(m.content)}</div>
              </article>
            ))}
            {pending ? (
              <article className="bubble bubble-ai pending">
                <span className="bubble-label">NEXTGW</span>
                <div className="bubble-body">
                  <p>Reading the pitch…</p>
                </div>
              </article>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form className="chat-input-row" onSubmit={onSubmit}>
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask who to start, captain, transfers…"
              disabled={pending}
              autoComplete="off"
            />
            <button className="cta" type="submit" disabled={pending || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      </section>

      <footer className="foot">
        Unofficial tool using the public FPL API. Not affiliated with the
        Premier League. Advice is probabilistic — you still pick the team.
      </footer>
    </div>
  );
}
