"use client";

import { useState, type FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/admin";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/edge/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Login failed");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 420, paddingTop: "4rem" }}>
      <h1 className="hero-title" style={{ fontSize: "2.4rem" }}>
        EDGE
      </h1>
      <p className="hero-copy">Private admin desk. Friends stay on /</p>
      <form
        onSubmit={onSubmit}
        className="hero-form"
        style={{ gridTemplateColumns: "1fr" }}
      >
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        <button className="cta" type="submit" disabled={pending || !password}>
          {pending ? "…" : "Enter"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
