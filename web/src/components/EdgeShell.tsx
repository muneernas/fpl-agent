"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "Edge briefing vs rivals",
  "Who should I start?",
  "Who should I transfer?",
  "Who should I captain?",
  "Any injury news?",
  "What should I do next?",
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

export function EdgeShell() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Private **EDGE** desk. Your entry ID is locked in config. Ask for rival briefing, XI, transfers, captain — this stays off the friends site.",
    },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || pending) return;
    setError(null);
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
      const res = await fetch("/api/edge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chat failed");
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", content: json.reply },
      ]);
      if (json.briefing?.strategy?.mode) {
        const rivals = json.briefing.rivals?.length ?? 0;
        setMeta(
          `mode ${json.briefing.strategy.mode} · rivals ${rivals} · uniques ${(json.briefing.your_unique || []).length}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
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
          <span className="brand-mark">EDGE</span>
          <span className="brand-sub">private /admin · friends use /</span>
        </div>
        {meta ? <div className="gw-chip">{meta}</div> : null}
      </header>

      <section className="hero hero-compact">
        <h1 className="hero-title">Your edge only.</h1>
        <p className="hero-copy">
          Rival differentials, chase-mode captaincy, auto-sub transfers — locked
          to your config. Keep the repo private.
        </p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="chat-shell" aria-label="Edge chat">
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
                  {m.role === "user" ? "You" : "EDGE"}
                </span>
                <div className="bubble-body">{renderMarkdownLite(m.content)}</div>
              </article>
            ))}
            {pending ? (
              <article className="bubble bubble-ai pending">
                <span className="bubble-label">EDGE</span>
                <div className="bubble-body">
                  <p>Scouting rivals…</p>
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
              placeholder="Ask for edge briefing, XI, transfers…"
              disabled={pending}
            />
            <button className="cta" type="submit" disabled={pending || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      </section>

      <footer className="foot">
        Private project. Do not deploy publicly without EDGE_PASSWORD. Do not
        share rival intel.
      </footer>
    </div>
  );
}
