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
    <div className="container">
      <form className="login-form" onSubmit={sendLink}>
        <h1 className="title" style={{ fontSize: 22 }}>Sign in</h1>
        {sent ? (
          <p>Check your email for a sign-in link.</p>
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
            {error && <p style={{ color: "#e05252" }}>{error}</p>}
          </>
        )}
      </form>
    </div>
  );
}
