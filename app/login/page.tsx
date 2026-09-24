"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="login-shell">
      <form className="login-form" onSubmit={sendLink}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="brand-mark">D</span>
          <span className="brand-name">Demonic Search</span>
        </div>
        {sent ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Check your email for a sign-in link.</p>
        ) : (
          <>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit">Send magic link</button>
            {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
          </>
        )}
      </form>
    </div>
  );
}
