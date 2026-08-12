"use client";

import Script from "next/script";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { markdownToHtml } from "@/lib/markdown";
import DiscoveryView from "./discovery-view";
import type { FollowUpRecommendation, LearningAnalytics, OutreachOutcome } from "@/lib/learning/types";

type Draft = {
  companyUrl: string;
  companyName: string;
  companySummary: string;
  evidence: string[];
  contributionIdeas: string[];
  selectedProjects: Array<{ title: string; liveUrl: string; repoUrl: string; reason: string }>;
  subject: string;
  body: string;
  demo?: boolean;
  source?: "ai" | "provider-ai" | "local-research";
};

type Project = { id: string; title: string; description: string; liveUrl: string; repoUrl: string };
type Profile = {
  name: string;
  role: string;
  context: string;
  portfolio: string;
  linkedin: string;
  projects: Project[];
  template: string;
};

type OpenEvent = { observedAt: string; userAgent: string };
type TrackedEmail = {
  id: string;
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  companyUrl: string;
  subject: string;
  gmailMessageId: string;
  trackingEnabled: boolean;
  selfTest: boolean;
  sentAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  opens: OpenEvent[];
};
type Analytics = {
  configured: boolean;
  generatedAt: string;
  stats: { sent: number; selfTests: number; opened: number; unopened: number; openRate: number; totalOpenEvents: number };
  emails: TrackedEmail[];
  outcomes: OutreachOutcome[];
  followUps: FollowUpRecommendation[];
  learning: LearningAnalytics;
  dashboard: { startupsResearched: number; qualifiedStartups: number; outreachSent: number; replyRate: number; positiveReplyRate: number; interviews: number; opportunitiesBuilt: number; opportunitiesConverted: number };
};

const initialProfile: Profile = {
  name: "Aksh Kaushik",
  role: "Product-minded software engineer",
  context: "I am a third-year BITS Pilani student who builds AI workflow products, full-stack systems, data pipelines, fintech tools, and developer utilities. I enjoy turning ambiguous startup problems into practical, inspectable products.",
  portfolio: "https://github.com/akshhkaushik",
  linkedin: "",
  projects: [],
  template: "Keep the message humble and personal. Preserve any unique context I add here, propose one small feature I could genuinely help prototype, and ask politely whether I might contribute to and learn from the team. Mention that my résumé is attached.",
};

const PROFILE_STORAGE_KEY = "signal-profile";
const COMPOSE_STORAGE_KEY = "signal-compose-v1";
const GMAIL_CONNECTION_KEY = "signal-gmail-autoconnect";
const GMAIL_TOKEN_KEY = "signal-gmail-token-v1";
const TOKEN_EXPIRY_BUFFER_MS = 120_000;

type CachedGmailToken = { accessToken: string; expiresAt: number };
type SavedCompose = {
  companyUrl: string;
  recipientEmail: string;
  recipientName: string;
  draft: Draft | null;
  subject: string;
  body: string;
  trackOpens: boolean;
};

function readCachedGmailToken(): CachedGmailToken | null {
  try {
    localStorage.removeItem(GMAIL_TOKEN_KEY);
    const value = sessionStorage.getItem(GMAIL_TOKEN_KEY);
    if (!value) return null;
    const cached = JSON.parse(value) as Partial<CachedGmailToken>;
    if (typeof cached.accessToken !== "string" || typeof cached.expiresAt !== "number" || cached.expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
      sessionStorage.removeItem(GMAIL_TOKEN_KEY);
      return null;
    }
    return { accessToken: cached.accessToken, expiresAt: cached.expiresAt };
  } catch {
    sessionStorage.removeItem(GMAIL_TOKEN_KEY);
    return null;
  }
}

function saveCachedGmailToken(accessToken: string, expiresAt: number) {
  localStorage.setItem(GMAIL_CONNECTION_KEY, "true");
  sessionStorage.setItem(GMAIL_TOKEN_KEY, JSON.stringify({ accessToken, expiresAt }));
}

function clearCachedGmailToken() {
  sessionStorage.removeItem(GMAIL_TOKEN_KEY);
  localStorage.removeItem(GMAIL_TOKEN_KEY);
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
            error_callback?: () => void;
          }) => { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
          revoke: (accessToken: string, callback: () => void) => void;
        };
      };
    };
  }
}

function hostFromUrl(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; }
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(new Date(value));
}

export default function Home() {
  const [view, setView] = useState<"compose" | "discovery" | "analytics">("compose");
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [companyUrl, setCompanyUrl] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [trackOpens, setTrackOpens] = useState(true);
  const [status, setStatus] = useState<"idle" | "researching" | "ready" | "sending" | "sent">("idle");
  const [notice, setNotice] = useState("");
  const [gmailToken, setGmailToken] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [profileRestored, setProfileRestored] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const tokenClientRef = useRef<{ requestAccessToken: (overrideConfig?: { prompt?: string }) => void } | null>(null);
  const tokenRefreshTimerRef = useRef<number | null>(null);
  const silentReconnectRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("view") === "discovery") setView("discovery");
      const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<Profile>;
          setProfile({
            ...initialProfile, ...parsed,
            name: typeof parsed.name === "string" ? parsed.name : initialProfile.name,
            role: typeof parsed.role === "string" ? parsed.role : initialProfile.role,
            context: typeof parsed.context === "string" ? parsed.context : initialProfile.context,
            portfolio: typeof parsed.portfolio === "string" ? parsed.portfolio : initialProfile.portfolio,
            linkedin: typeof parsed.linkedin === "string" ? parsed.linkedin : initialProfile.linkedin,
            template: typeof parsed.template === "string" ? parsed.template : initialProfile.template,
            projects: Array.isArray(parsed.projects) ? parsed.projects : [],
          });
        } catch { localStorage.removeItem(PROFILE_STORAGE_KEY); }
      }
      const savedCompose = localStorage.getItem(COMPOSE_STORAGE_KEY);
      if (savedCompose) {
        try {
          const parsed = JSON.parse(savedCompose) as Partial<SavedCompose>;
          setCompanyUrl(typeof parsed.companyUrl === "string" ? parsed.companyUrl : "");
          setRecipientEmail(typeof parsed.recipientEmail === "string" ? parsed.recipientEmail : "");
          setRecipientName(typeof parsed.recipientName === "string" ? parsed.recipientName : "");
          setDraft(parsed.draft && typeof parsed.draft === "object" ? parsed.draft : null);
          setSubject(typeof parsed.subject === "string" ? parsed.subject : "");
          setBody(typeof parsed.body === "string" ? parsed.body : "");
          setTrackOpens(typeof parsed.trackOpens === "boolean" ? parsed.trackOpens : true);
          if (parsed.draft && typeof parsed.draft === "object") setStatus("ready");
        } catch { localStorage.removeItem(COMPOSE_STORAGE_KEY); }
      }
      const cachedGmail = readCachedGmailToken();
      if (cachedGmail) setGmailToken(cachedGmail.accessToken);
      setProfileRestored(true);
    }, 0);
    fetch("/api/config").then((response) => response.json()).then((data) => setGoogleClientId(data.googleClientId || "")).catch(() => undefined);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (profileRestored) localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }, [profile, profileRestored]);

  useEffect(() => {
    if (!profileRestored) return;
    const timer = window.setTimeout(() => {
      const saved: SavedCompose = { companyUrl, recipientEmail, recipientName, draft, subject, body, trackOpens };
      localStorage.setItem(COMPOSE_STORAGE_KEY, JSON.stringify(saved));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [body, companyUrl, draft, profileRestored, recipientEmail, recipientName, subject, trackOpens]);

  useEffect(() => {
    if (!googleClientId || !googleScriptReady || !window.google) return;
    const requestSilently = () => {
      silentReconnectRef.current = true;
      tokenClientRef.current?.requestAccessToken({ prompt: "" });
    };
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: "openid email https://www.googleapis.com/auth/gmail.send",
      callback: (response) => {
        const wasSilent = silentReconnectRef.current;
        silentReconnectRef.current = false;
        if (response.access_token) {
          const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
          setGmailToken(response.access_token);
          saveCachedGmailToken(response.access_token, expiresAt);
          setNotice(wasSilent ? "Gmail reconnected." : "Gmail connected.");
          if (tokenRefreshTimerRef.current) window.clearTimeout(tokenRefreshTimerRef.current);
          tokenRefreshTimerRef.current = window.setTimeout(requestSilently, Math.max(expiresAt - Date.now() - TOKEN_EXPIRY_BUFFER_MS, 60_000));
        } else if (wasSilent) {
          setGmailToken("");
          clearCachedGmailToken();
          setNotice("Reconnect Gmail once to continue.");
        } else setNotice("Gmail connection was not completed.");
      },
      error_callback: () => {
        silentReconnectRef.current = false;
        setGmailToken("");
        clearCachedGmailToken();
        setNotice("Google needs one click to reconnect Gmail.");
      },
    });
    const cached = readCachedGmailToken();
    if (cached) {
      tokenRefreshTimerRef.current = window.setTimeout(requestSilently, Math.max(cached.expiresAt - Date.now() - TOKEN_EXPIRY_BUFFER_MS, 60_000));
    } else if (localStorage.getItem(GMAIL_CONNECTION_KEY) === "true") requestSilently();
    return () => { if (tokenRefreshTimerRef.current) window.clearTimeout(tokenRefreshTimerRef.current); };
  }, [googleClientId, googleScriptReady]);

  const companyHost = companyUrl ? hostFromUrl(companyUrl) : recipientEmail.split("@")[1] || "the company";

  const loadAnalytics = useCallback(async () => {
    if (!gmailToken) return;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const response = await fetch("/api/analytics", { headers: { Authorization: `Bearer ${gmailToken}` }, cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        clearCachedGmailToken();
        setGmailToken("");
      }
      if (!response.ok) throw new Error(result.error || "Analytics could not be loaded.");
      setAnalytics(result);
    } catch (error) {
      setAnalyticsError(error instanceof Error ? error.message : "Analytics could not be loaded.");
    } finally { setAnalyticsLoading(false); }
  }, [gmailToken]);

  useEffect(() => {
    if (view !== "analytics" || !gmailToken) return;
    const timer = window.setTimeout(() => void loadAnalytics(), 0);
    return () => window.clearTimeout(timer);
  }, [view, gmailToken, loadAnalytics]);

  function updateProfile(field: Exclude<keyof Profile, "projects">, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function connectGmail() {
    if (!googleClientId) return setNotice("Gmail is not configured yet.");
    if (!tokenClientRef.current) return setNotice("Google sign-in is still loading. Try again in a moment.");
    silentReconnectRef.current = false;
    tokenClientRef.current.requestAccessToken();
  }

  function disconnectGmail() {
    const finish = () => {
      if (tokenRefreshTimerRef.current) window.clearTimeout(tokenRefreshTimerRef.current);
      localStorage.removeItem(GMAIL_CONNECTION_KEY);
      clearCachedGmailToken();
      setGmailToken(""); setAnalytics(null); setNotice("Gmail disconnected.");
    };
    if (gmailToken && window.google) window.google.accounts.oauth2.revoke(gmailToken, finish); else finish();
  }

  async function generateDraft(event: FormEvent) {
    event.preventDefault();
    if (!gmailToken) { connectGmail(); return; }
    setNotice(""); setStatus("researching"); setDraft(null);
    try {
      const response = await fetch("/api/draft", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${gmailToken}` },
        body: JSON.stringify({ companyUrl, recipientEmail, recipientName, profile }),
        signal: AbortSignal.timeout(55_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create the draft.");
      setDraft(result); setSubject(result.subject); setBody(result.body); setStatus("ready");
      setNotice(result.source === "local-research"
        ? "Draft ready using direct website research. The free AI providers were busy, so no paid request was required."
        : "Draft ready. Read it once before sending.");
    } catch (error) {
      setStatus("idle");
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      setNotice(timedOut
        ? "Research took too long. Please try once more; the app will reuse faster public fallbacks."
        : error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  async function sendEmail() {
    if (!gmailToken) return connectGmail();
    if (!resume) return setNotice("Attach your résumé before sending.");
    setStatus("sending"); setNotice("");
    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${gmailToken}` },
        body: JSON.stringify({
          to: recipientEmail, recipientName, subject, body, trackOpens,
          companyName: draft?.companyName || companyHost,
          companyUrl: draft?.companyUrl || companyUrl,
          resume: { name: resume.name, type: resume.type || "application/pdf", base64: await fileToBase64(resume) },
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        clearCachedGmailToken();
        setGmailToken("");
      }
      if (!response.ok) throw new Error(result.error || "Gmail could not send this message.");
      setStatus("sent");
      setNotice(result.warning || (result.tracked ? "Email sent. Open tracking is active." : "Email sent without open tracking."));
      setAnalytics(null);
    } catch (error) { setStatus("ready"); setNotice(error instanceof Error ? error.message : "The email was not sent."); }
  }

  return (
    <main className="app-shell">
      <Script id="google-identity-script" src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setGoogleScriptReady(true)} />

      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView("compose")} aria-label="Outreach home">
          <span className="brand-mark">A</span><span>Aksh Outreach</span>
        </button>
        <nav className="view-nav" aria-label="Workspace views">
          <button className={view === "compose" ? "active" : ""} aria-current={view === "compose" ? "page" : undefined} onClick={() => setView("compose")} type="button">Compose</button>
          <button className={view === "discovery" ? "active" : ""} aria-current={view === "discovery" ? "page" : undefined} onClick={() => setView("discovery")} type="button">Discovery</button>
          <button className={view === "analytics" ? "active" : ""} aria-current={view === "analytics" ? "page" : undefined} onClick={() => setView("analytics")} type="button">Analytics</button>
        </nav>
        <button className={`connection ${gmailToken ? "connected" : ""}`} title={gmailToken ? "Connected on this browser · click to disconnect" : "Connect Gmail"} onClick={gmailToken ? disconnectGmail : connectGmail} type="button">
          <span className="connection-dot" />{gmailToken ? "Gmail connected" : "Connect Gmail"}
        </button>
      </header>

      {view === "compose" ? (
        <div className="page-wrap">
          <header className="page-heading">
            <div><p className="kicker">New outreach</p><h1>Send one thoughtful email.</h1></div>
            <p>Research the company, shape a useful contribution, and review every word before it leaves your inbox.</p>
          </header>

          <div className="compose-layout">
            <section className="compose-main">
              <form className="panel target-panel" onSubmit={generateDraft}>
                <div className="panel-heading"><div><span className="step-number">1</span><h2>Recipient and company</h2></div><span>Required fields are marked</span></div>
                <div className="form-grid">
                  <label>Recipient email *<input required type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="founder@company.com" /></label>
                  <label>Recipient name<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="First name, if known" /></label>
                  <label className="wide">Company website *<input required type="url" value={companyUrl} onChange={(event) => setCompanyUrl(event.target.value)} placeholder="https://company.com" /></label>
                  <label className="wide">Résumé
                    <div className={`file-field ${resume ? "ready" : ""}`}>
                      <input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setResume(event.target.files?.[0] || null)} />
                      <span>{resume ? "✓" : "+"}</span><div><b>{resume?.name || "Attach your résumé"}</b><small>{resume ? `${(resume.size / 1024 / 1024).toFixed(2)} MB` : "PDF or DOCX, up to 8 MB"}</small></div>
                    </div>
                  </label>
                </div>
                <button className="primary-button" disabled={status === "researching"} type="submit">
                  {status === "researching" ? <><span className="spinner" />Researching {companyHost}…</> : <>Research company and prepare email <span>→</span></>}
                </button>
              </form>

              {notice && <div className={`notice ${status === "sent" ? "success" : ""}`} role="status">{notice}</div>}

              {draft && (
                <div className="draft-stack">
                  <section className="panel research-panel">
                    <div className="company-heading"><span>{draft.companyName.slice(0, 1)}</span><div><p className="kicker">Research notes</p><h2>{draft.companyName}</h2></div><a href={draft.companyUrl} target="_blank" rel="noreferrer">Open website ↗</a></div>
                    <p className="company-summary">{draft.companySummary}</p>
                    <div className="research-grid">
                      <div><h3>What stood out</h3><ul>{draft.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <div><h3>Possible contribution</h3><ul>{draft.contributionIdeas.map((item) => <li key={item}>{item}</li>)}</ul></div>
                    </div>
                    {draft.selectedProjects.length > 0 && <div className="project-strip"><span>Matched work</span>{draft.selectedProjects.map((project) => <a key={project.liveUrl} href={project.liveUrl} target="_blank" rel="noreferrer">{project.title} ↗</a>)}</div>}
                  </section>

                  <section className="panel editor-panel">
                    <div className="panel-heading"><div><span className="step-number">2</span><h2>Review and send</h2></div><span>Everything remains editable</span></div>
                    <div className="address-row"><label>To<input value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} /></label></div>
                    <div className="address-row"><label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label></div>
                    <div className="email-preview" dangerouslySetInnerHTML={{ __html: markdownToHtml(body) }} />
                    <details className="source-editor"><summary>Edit message text</summary><textarea rows={18} aria-label="Message source" value={body} onChange={(event) => setBody(event.target.value)} /><p>Use **bold** and [linked text](https://example.com).</p></details>
                    <div className="send-options">
                      <label className="tracking-control"><input type="checkbox" checked={trackOpens} onChange={(event) => setTrackOpens(event.target.checked)} /><span><b>Track opens</b><small>Adds a private one-pixel image. Automatically disabled when you send a test email to your own Gmail account.</small></span></label>
                      <div className="attachment-note"><span>▣</span><div><b>{resume?.name || "Résumé not attached"}</b><small>{resume ? "Ready to attach" : "Required before sending"}</small></div></div>
                    </div>
                    <footer className="send-footer"><p>The email is sent only when you press this button.</p><button className="send-button" type="button" disabled={status === "sending" || status === "sent"} onClick={sendEmail}>{status === "sending" ? "Sending…" : status === "sent" ? "Sent ✓" : gmailToken ? "Send email" : "Connect Gmail to send"}</button></footer>
                  </section>
                </div>
              )}
            </section>

            <aside className="context-panel panel">
              <div className="context-heading"><div><p className="kicker">Your context</p><h2>What stays consistent</h2></div><span className="saved-mark">Saved</span></div>
              <p className="context-copy">This is kept on this browser and used to shape each draft. It changes only when you edit it.</p>
              <label>Core instructions<textarea rows={12} value={profile.template} onChange={(event) => updateProfile("template", event.target.value)} /></label>
              <div className="fixed-work"><b>Always included</b><span>Introduction as a BITS Pilani student</span><span>CEO Voice Platform</span><span>Veritas</span><span>EvoComb</span><span>GLOB</span><span>Your fixed signature</span></div>
              <details className="profile-details"><summary>Personal details</summary><label>Name<input value={profile.name} onChange={(event) => updateProfile("name", event.target.value)} /></label><label>Role<input value={profile.role} onChange={(event) => updateProfile("role", event.target.value)} /></label><label>Additional context<textarea rows={5} value={profile.context} onChange={(event) => updateProfile("context", event.target.value)} /></label></details>
            </aside>
          </div>
        </div>
      ) : view === "discovery" ? (
        <DiscoveryView gmailToken={gmailToken} onConnect={connectGmail} onTokenExpired={() => { clearCachedGmailToken(); setGmailToken(""); }} />
      ) : (
        <AnalyticsView analytics={analytics} loading={analyticsLoading} error={analyticsError} gmailConnected={Boolean(gmailToken)} gmailToken={gmailToken} onConnect={connectGmail} onRefresh={loadAnalytics} />
      )}
    </main>
  );
}

function AnalyticsView({ analytics, loading, error, gmailConnected, gmailToken, onConnect, onRefresh }: {
  analytics: Analytics | null; loading: boolean; error: string; gmailConnected: boolean; gmailToken: string; onConnect: () => void; onRefresh: () => void;
}) {
  async function classifyOutcome(id: string, replyClassification: string) {
    const response = await fetch("/api/outcomes", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${gmailToken}` }, body: JSON.stringify({ id, replyClassification }) });
    if (response.ok) onRefresh();
  }
  return <div className="page-wrap analytics-page">
    <header className="analytics-heading"><div><p className="kicker">Outreach analytics</p><h1>Know what happened after send.</h1><p>Open events are recorded to the second when the tracking image is requested.</p></div><button className="secondary-button" type="button" onClick={onRefresh} disabled={!gmailConnected || loading}>{loading ? "Refreshing…" : "Refresh data"}</button></header>
    <div className="accuracy-note"><b>How to read this:</b> “Opened” means the tracking image was loaded. Gmail and Apple can proxy or pre-load images, while recipients who block images may read without creating an event. Emails sent to your own connected mailbox are treated as self-tests and excluded automatically.</div>
    {!gmailConnected ? <section className="panel analytics-empty"><span>↗</span><h2>Connect Gmail to see your private analytics</h2><p>Your connected Google identity is used to ensure only you can see recipient and open data.</p><button className="primary-button compact" type="button" onClick={onConnect}>Connect Gmail</button></section>
    : error ? <section className="panel analytics-empty"><h2>Analytics could not load</h2><p>{error}</p><button className="secondary-button" type="button" onClick={onRefresh}>Try again</button></section>
    : <>
      <section className="metric-grid" aria-label="Email metrics">
        <div className="metric"><span>Sent</span><b>{analytics?.stats.sent ?? 0}</b><small>Excludes {analytics?.stats.selfTests ?? 0} self-test{analytics?.stats.selfTests === 1 ? "" : "s"}</small></div>
        <div className="metric"><span>Opened</span><b>{analytics?.stats.opened ?? 0}</b><small>Unique emails</small></div>
        <div className="metric"><span>Open rate</span><b>{analytics?.stats.openRate ?? 0}%</b><small>At least one observed load</small></div>
        <div className="metric"><span>Open events</span><b>{analytics?.stats.totalOpenEvents ?? 0}</b><small>Including repeat loads</small></div>
      </section>
      <section className="metric-grid" aria-label="Outcome metrics">
        <div className="metric"><span>Startups researched</span><b>{analytics?.dashboard?.startupsResearched ?? 0}</b><small>Evidence-backed intelligence</small></div>
        <div className="metric"><span>Qualified startups</span><b>{analytics?.dashboard?.qualifiedStartups ?? 0}</b><small>Score tier B or higher</small></div>
        <div className="metric"><span>Outreach sent</span><b>{analytics?.dashboard?.outreachSent ?? 0}</b><small>Audited intelligence outreach</small></div>
        <div className="metric"><span>Reply rate</span><b>{analytics?.dashboard?.replyRate ?? 0}%</b><small>n = {analytics?.learning?.totals.sent ?? 0}</small></div>
      </section>
      <section className="metric-grid" aria-label="Conversion metrics">
        <div className="metric"><span>Positive reply rate</span><b>{analytics?.dashboard?.positiveReplyRate ?? 0}%</b><small>Interested, maybe, or referral</small></div>
        <div className="metric"><span>Interviews</span><b>{analytics?.dashboard?.interviews ?? 0}</b><small>Manually recorded outcomes</small></div>
        <div className="metric"><span>Opportunities built</span><b>{analytics?.dashboard?.opportunitiesBuilt ?? 0}</b><small>Completed BuildSpecs</small></div>
        <div className="metric"><span>Opportunities converted</span><b>{analytics?.dashboard?.opportunitiesConverted ?? 0}</b><small>Positive built outreach</small></div>
      </section>
      <section className="panel activity-panel learning-panel"><div className="activity-heading"><div><h2>Follow-up recommendations</h2><p>Recommendations only—each must return to review before sending.</p></div><span>{analytics?.followUps?.length ?? 0} due</span></div>{!analytics?.followUps?.length ? <div className="table-empty"><p>No follow-ups are due.</p></div> : analytics.followUps.map((item) => <article key={item.outcomeId}><b>Day {item.cadenceDay} · follow-up {item.followUpNumber}</b><p>{item.reason} {item.suggestedAngle}</p><span>Approval required</span></article>)}</section>
      <section className="panel activity-panel learning-panel outcomes-panel"><div className="activity-heading"><div><h2>Outcomes</h2><p>Classify replies manually; opens are not treated as replies.</p></div><span>{analytics?.outcomes?.length ?? 0} outreach records</span></div>{!analytics?.outcomes?.length ? <div className="table-empty"><p>No intelligence outreach has been sent yet.</p></div> : analytics.outcomes.map((item) => <article key={item.id}><b>{item.startupTier} tier · {item.outreachMode.replaceAll("_", " ")}</b><p>{item.contributionType} · sent {formatTime(item.sentAt)}</p><select aria-label="Reply classification" value={item.replyClassification || ""} onChange={(event) => void classifyOutcome(item.id, event.target.value)}><option value="">Pending</option><option value="interested">Interested</option><option value="maybe">Maybe</option><option value="referral">Referral</option><option value="wrong_person">Wrong person</option><option value="rejected">Rejected</option><option value="no_response">No response</option></select></article>)}</section>
      <section className="panel activity-panel learning-panel"><div className="activity-heading"><div><h2>Learning signals</h2><p>Descriptive samples only; scoring weights never change automatically.</p></div></div>{!analytics?.learning?.suggestedAdjustments.length ? <div className="table-empty"><p>No adjustment suggestion has enough data yet.</p></div> : analytics.learning.suggestedAdjustments.map((item) => <article key={item.title}><b>{item.title}</b><p>{item.evidence}</p><span>n = {item.sampleSize} · human approval required</span></article>)}</section>
      <section className="panel activity-panel">
        <div className="activity-heading"><div><h2>Email activity</h2><p>{analytics?.generatedAt ? `Updated ${formatTime(analytics.generatedAt)}` : "Waiting for the first refresh"}</p></div><span>{analytics?.emails.length ?? 0} total</span></div>
        {!analytics || analytics.emails.length === 0 ? <div className="table-empty"><h3>No tracked emails yet</h3><p>Send an email with “Track opens” enabled and it will appear here.</p></div>
        : <div className="email-list">{analytics.emails.map((email) => <article className="email-row" key={email.id}>
          <div className="email-primary"><span className={`status-mark ${!email.selfTest && email.firstOpenedAt ? "opened" : ""}`} /> <div><b>{email.recipientName || email.recipientEmail}</b><small>{email.recipientEmail}</small></div></div>
          <div className="email-subject"><b>{email.subject}</b><small>{email.companyName || hostFromUrl(email.companyUrl)}</small></div>
          <div className="email-time"><span>Sent</span><b>{formatTime(email.sentAt)}</b></div>
          <div className="email-time"><span>{email.selfTest ? "Status" : email.firstOpenedAt ? "First observed open" : email.trackingEnabled ? "Status" : "Tracking"}</span><b>{email.selfTest ? "Self-test · excluded" : email.firstOpenedAt ? formatTime(email.firstOpenedAt) : email.trackingEnabled ? "Not observed" : "Off"}</b></div>
          <div className="open-count"><b>{email.selfTest ? "—" : email.openCount}</b><span>{email.selfTest ? "ignored" : `load${email.openCount === 1 ? "" : "s"}`}</span></div>
          {email.opens?.length > 0 && <details className="event-details"><summary>{email.selfTest ? "View ignored load history" : "View observed event history"}</summary><div>{email.opens.map((event, index) => <p key={`${event.observedAt}-${index}`}><b>{formatTime(event.observedAt)}</b><span>{event.userAgent}</span></p>)}</div></details>}
        </article>)}</div>}
      </section>
    </>}
  </div>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) return reject(new Error("Please choose a résumé smaller than 8 MB."));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the résumé."));
    reader.readAsDataURL(file);
  });
}
