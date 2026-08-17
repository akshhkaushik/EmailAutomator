"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StartupIntelligencePanel from "@/app/startup-intelligence";

const GMAIL_TOKEN_KEY = "signal-gmail-token-v1";
const TOKEN_EXPIRY_BUFFER_MS = 120_000;

export default function StartupDetailClient({ startupId }: { startupId: string }) {
  const [token, setToken] = useState("");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const cached = JSON.parse(localStorage.getItem(GMAIL_TOKEN_KEY) || "{}") as { accessToken?: string; expiresAt?: number };
        if (cached.accessToken && cached.expiresAt && cached.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) setToken(cached.accessToken);
        else localStorage.removeItem(GMAIL_TOKEN_KEY);
      } catch { localStorage.removeItem(GMAIL_TOKEN_KEY); }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function expireToken() { localStorage.removeItem(GMAIL_TOKEN_KEY); setToken(""); }

  return <main className="app-shell">
    <header className="topbar detail-topbar"><Link className="brand" href="/?view=discovery"><span className="brand-mark">A</span><span>Aksh Outreach</span></Link><Link className="secondary-button" href="/?view=discovery">← Back to discovery</Link></header>
    <div className="page-wrap startup-detail-page">
      {!restored ? <section className="panel table-empty"><p>Restoring your secure session…</p></section>
      : !token ? <section className="panel analytics-empty"><span>◎</span><h2>Reconnect Gmail from the dashboard</h2><p>Your verified Google identity is required to view private startup evidence.</p><Link className="primary-button compact" href="/?view=discovery">Return to dashboard</Link></section>
      : <StartupIntelligencePanel startupId={startupId} gmailToken={token} onClose={() => { if (window.history.length > 1) window.history.back(); else window.location.href = "/?view=discovery"; }} onTokenExpired={expireToken} />}
    </div>
  </main>;
}
