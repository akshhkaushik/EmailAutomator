"use client";

import Script from "next/script";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { markdownToHtml } from "@/lib/markdown";
import type { FounderContact } from "@/lib/contacts/types";

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
type ClickEvent = { observedAt: string; userAgent: string; linkId: string; url: string };
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
  clickCount: number;
  clicks: ClickEvent[];
};
type DirectResearch = {
  companyUrl: string;
  companyName: string;
  domain: string;
  founders: Array<{ name: string; role: string; profileUrl: string | null; source: string }>;
  selectedFounder: { name: string; role: string; profileUrl: string | null; source: string } | null;
  contact: FounderContact | null;
  providerConfigured: boolean;
  sourceUrl: string;
  researchedAt: string;
};
type Analytics = {
  configured: boolean;
  generatedAt: string;
  stats: { sent: number; selfTests: number; opened: number; unopened: number; openRate: number; totalOpenEvents: number; totalLinkClicks: number };
  emails: TrackedEmail[];
};

const initialProfile: Profile = {
  name: "Aksh Kaushik",
  role: "Product-minded software engineer",
  context: "I am a third-year BITS Pilani student who builds AI workflow products, full-stack systems, data pipelines, fintech tools, and developer utilities. I enjoy turning ambiguous startup problems into practical, inspectable products.",
  portfolio: "https://github.com/akshhkaushik",
  linkedin: "",
  projects: [],
  template: "Keep the message humble and personal. Preserve any unique context I add here, propose one small feature I could genuinely help prototype, and ask politely whether I might contribute to and learn from the team.",
};

const PROFILE_STORAGE_KEY = "signal-profile";
const GMAIL_CONNECTION_KEY = "signal-gmail-autoconnect";
const GMAIL_TOKEN_KEY = "signal-gmail-token-v1";
const TOKEN_EXPIRY_BUFFER_MS = 120_000;

type CachedGmailToken = { accessToken: string; expiresAt: number };
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
  const [view, setView] = useState<"compose" | "analytics">("compose");
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [companyUrl, setCompanyUrl] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
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
  const [directResearch, setDirectResearch] = useState<DirectResearch | null>(null);
  const tokenClientRef = useRef<{ requestAccessToken: (overrideConfig?: { prompt?: string }) => void } | null>(null);
  const tokenRefreshTimerRef = useRef<number | null>(null);
  const silentReconnectRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requestedView = new URLSearchParams(window.location.search).get("view");
      if (requestedView === "analytics") setView("analytics");
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
      // Older builds persisted drafts in the browser. Start every focused
      // startup-link workflow clean so a previous recipient cannot leak into it.
      localStorage.removeItem("signal-compose-v1");
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
    setNotice(""); setStatus("researching"); setDraft(null); setDirectResearch(null); setRecipientEmail(""); setRecipientName("");
    try {
      const researchResponse = await fetch("/api/direct-research", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${gmailToken}` },
        body: JSON.stringify({ companyUrl }), signal: AbortSignal.timeout(30_000),
      });
      const researchResult = await researchResponse.json() as DirectResearch & { error?: string };
      if (!researchResponse.ok) throw new Error(researchResult.error || "Could not research the startup or identify a founder.");
      setDirectResearch(researchResult);
      setRecipientName(researchResult.selectedFounder?.name || "");
      if (researchResult.contact?.email) {
        setRecipientEmail(researchResult.contact.email);
      }
      const safeRecipient = researchResult.contact?.email || "research-only@placeholder.invalid";
      const response = await fetch("/api/draft", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${gmailToken}` },
        body: JSON.stringify({ companyUrl: researchResult.companyUrl, recipientEmail: safeRecipient, recipientName: researchResult.selectedFounder?.name || "Founder", profile }),
        signal: AbortSignal.timeout(55_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create the draft.");
      setDraft(result); setSubject(result.subject); setBody(result.body); setStatus("ready");
      setNotice(researchResult.contact?.email
        ? `Draft ready for ${researchResult.contact.founderName}. The address passed the configured deliverability check.`
        : researchResult.selectedFounder
          ? `Draft ready for ${researchResult.selectedFounder.name}, but no safely verified email was found. Review the ordered candidates; sending remains blocked until verification succeeds.`
          : "The startup was researched, but no founder was supported by the public page. The draft is ready without a recipient; verify a founder before sending.");
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
    const contactIsSafe = Boolean(directResearch?.contact?.email) && (directResearch?.contact?.verificationStatus === "valid" || (directResearch?.contact?.verificationStatus === "accept_all" && (directResearch?.contact?.confidence || 0) >= 85));
    if (!contactIsSafe || recipientEmail !== directResearch?.contact?.email) return setNotice("A safely verified founder email is required before sending.");
    setStatus("sending"); setNotice("");
    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${gmailToken}` },
        body: JSON.stringify({
          to: recipientEmail, recipientName, subject, body, trackOpens,
          companyName: draft?.companyName || companyHost,
          companyUrl: draft?.companyUrl || companyUrl,
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
        <button className="brand" type="button" onClick={() => setView("compose")} aria-label="Startup outreach home">
          <span className="brand-mark">A</span><span>Aksh Outreach</span>
        </button>
        <nav className="view-nav" aria-label="Workspace views">
          <button className={view === "compose" ? "active" : ""} aria-current={view === "compose" ? "page" : undefined} onClick={() => setView("compose")} type="button">New email</button>
          <button className={view === "analytics" ? "active" : ""} aria-current={view === "analytics" ? "page" : undefined} onClick={() => setView("analytics")} type="button">Tracking</button>
        </nav>
        <button className={`connection ${gmailToken ? "connected" : ""}`} title={gmailToken ? "Connected on this browser · click to disconnect" : "Connect Gmail"} onClick={gmailToken ? disconnectGmail : connectGmail} type="button">
          <span className="connection-dot" />{gmailToken ? "Gmail connected" : "Connect Gmail"}
        </button>
      </header>

      {view === "compose" ? (
        <div className="page-wrap">
          <header className="page-heading">
            <div><p className="kicker">One focused workflow</p><h1>Paste a startup link.</h1></div>
            <p>We identify a founder, check likely company-email patterns, research the startup, draft one email, and wait for your approval before Gmail sends it.</p>
          </header>

          <div className="compose-layout">
            <section className="compose-main">
              <form className="panel target-panel" onSubmit={generateDraft}>
                <div className="panel-heading"><div><span className="step-number">1</span><h2>Startup link</h2></div><span>Nothing else required to research</span></div>
                <div className="form-grid">
                  <label className="wide">Startup website or accelerator profile *<input required type="url" value={companyUrl} onChange={(event) => setCompanyUrl(event.target.value)} placeholder="https://startup.com" /></label>
                </div>
                <button className="primary-button" disabled={status === "researching"} type="submit">
                  {status === "researching" ? <><span className="spinner" />Finding founder and researching {companyHost}…</> : <>Find founder, research, and draft <span>→</span></>}
                </button>
              </form>

              {notice && <div className={`notice ${status === "sent" ? "success" : ""}`} role="status">{notice}</div>}

              {draft && (
                <div className="draft-stack">
                  <section className="panel founder-result">
                    <div className="panel-heading"><div><span className="step-number">2</span><h2>Founder and email</h2></div><span>{directResearch?.contact?.verificationStatus || "not verified"}</span></div>
                    {directResearch?.selectedFounder ? <div className="founder-summary"><div><b>{directResearch.selectedFounder.name}</b><span>{directResearch.selectedFounder.role}</span><small>Source: {directResearch.selectedFounder.source}</small></div><div><b>{directResearch.contact?.email || "No verified address"}</b><span>{directResearch.contact ? `${directResearch.contact.confidence}% confidence · ${directResearch.contact.provider}` : "Founder found; email unresolved"}</span></div></div> : <p className="company-summary">No founder name was supported by the public page. Do not guess a person or recipient.</p>}
                    {directResearch?.contact && !directResearch.contact.email && <details className="candidate-list"><summary>Inspect ordered email combinations</summary><ol>{directResearch.contact.candidates.map((candidate) => <li key={candidate.email}><b>#{candidate.rank} {candidate.pattern}</b><span>{candidate.email}</span><small>{candidate.verificationStatus}{candidate.confidence ? ` · ${candidate.confidence}%` : ""}</small></li>)}</ol></details>}
                    <div className="form-grid founder-recipient-fields"><label>Recipient email<input readOnly type="email" value={recipientEmail} placeholder="No safely verified address" /></label><label>Recipient name<input readOnly value={recipientName} /></label></div>
                  </section>
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
                    <div className="panel-heading"><div><span className="step-number">3</span><h2>Review and send</h2></div><span>Everything remains editable</span></div>
                    <div className="address-row"><label>To<input value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} /></label></div>
                    <div className="address-row"><label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label></div>
                    <div className="email-preview" dangerouslySetInnerHTML={{ __html: markdownToHtml(body) }} />
                    <details className="source-editor"><summary>Edit message text</summary><textarea rows={18} aria-label="Message source" value={body} onChange={(event) => setBody(event.target.value)} /><p>Use **bold** and [linked text](https://example.com).</p></details>
                    <div className="send-options">
                      <label className="tracking-control"><input type="checkbox" checked={trackOpens} onChange={(event) => setTrackOpens(event.target.checked)} /><span><b>Track observed opens and link clicks</b><small>Open detection uses a pixel and can be blocked or proxied. Links are redirected through a click counter. Self-tests are excluded.</small></span></label>
                      <div className="attachment-note"><span>✓</span><div><b>Explicit approval required</b><small>No autonomous sending and no unverified recipient addresses.</small></div></div>
                    </div>
                    <footer className="send-footer"><p>No system can guarantee inbox placement. Keep the email truthful and personal; it sends only when you press this button.</p><button className="send-button" type="button" disabled={!directResearch?.contact?.email || status === "sending" || status === "sent"} onClick={sendEmail}>{status === "sending" ? "Sending…" : status === "sent" ? "Sent ✓" : gmailToken ? "Review complete · Send" : "Connect Gmail to send"}</button></footer>
                  </section>
                </div>
              )}
            </section>

          </div>
        </div>
      ) : (
        <AnalyticsView analytics={analytics} loading={analyticsLoading} error={analyticsError} gmailConnected={Boolean(gmailToken)} gmailToken={gmailToken} onConnect={connectGmail} onRefresh={loadAnalytics} />
      )}
    </main>
  );
}

function AnalyticsView({ analytics, loading, error, gmailConnected, gmailToken, onConnect, onRefresh }: {
  analytics: Analytics | null; loading: boolean; error: string; gmailConnected: boolean; gmailToken: string; onConnect: () => void; onRefresh: () => void;
}) {
  void gmailToken;
  return <div className="page-wrap analytics-page">
    <header className="analytics-heading"><div><p className="kicker">Email tracking</p><h1>Observed opens and link clicks.</h1><p>See when the tracking image loaded and exactly which embedded links were requested.</p></div><button className="secondary-button" type="button" onClick={onRefresh} disabled={!gmailConnected || loading}>{loading ? "Refreshing…" : "Refresh"}</button></header>
    <div className="accuracy-note"><b>Important:</b> “Open observed” means the tracking image loaded. Some clients proxy or pre-load images, while others block them. Therefore “no open observed” does not prove the email was unread. Link clicks are stronger signals, but security scanners can also visit links.</div>
    {!gmailConnected ? <section className="panel analytics-empty"><span>↗</span><h2>Connect Gmail to see your private analytics</h2><p>Your connected Google identity is used to ensure only you can see recipient and open data.</p><button className="primary-button compact" type="button" onClick={onConnect}>Connect Gmail</button></section>
    : error ? <section className="panel analytics-empty"><h2>Analytics could not load</h2><p>{error}</p><button className="secondary-button" type="button" onClick={onRefresh}>Try again</button></section>
    : <>
      <section className="metric-grid" aria-label="Email metrics">
        <div className="metric"><span>Sent</span><b>{analytics?.stats.sent ?? 0}</b><small>Excludes {analytics?.stats.selfTests ?? 0} self-test{analytics?.stats.selfTests === 1 ? "" : "s"}</small></div>
        <div className="metric"><span>Open observed</span><b>{analytics?.stats.opened ?? 0}</b><small>{analytics?.stats.openRate ?? 0}% of tracked messages</small></div>
        <div className="metric"><span>Open loads</span><b>{analytics?.stats.totalOpenEvents ?? 0}</b><small>Including repeated/proxied loads</small></div>
        <div className="metric"><span>Link clicks</span><b>{analytics?.stats.totalLinkClicks ?? 0}</b><small>All tracked-link requests</small></div>
      </section>
      <section className="panel activity-panel">
        <div className="activity-heading"><div><h2>Email activity</h2><p>{analytics?.generatedAt ? `Updated ${formatTime(analytics.generatedAt)}` : "Waiting for the first refresh"}</p></div><span>{analytics?.emails.length ?? 0} total</span></div>
        {!analytics || analytics.emails.length === 0 ? <div className="table-empty"><h3>No tracked emails yet</h3><p>Send an email with “Track opens” enabled and it will appear here.</p></div>
        : <div className="email-list">{analytics.emails.map((email) => <article className="email-row" key={email.id}>
          <div className="email-primary"><span className={`status-mark ${!email.selfTest && email.firstOpenedAt ? "opened" : ""}`} /> <div><b>{email.recipientName || email.recipientEmail}</b><small>{email.recipientEmail}</small></div></div>
          <div className="email-subject"><b>{email.subject}</b><small>{email.companyName || hostFromUrl(email.companyUrl)}</small></div>
          <div className="email-time"><span>Sent</span><b>{formatTime(email.sentAt)}</b></div>
          <div className="email-time"><span>{email.selfTest ? "Status" : email.firstOpenedAt ? "First observed open" : email.trackingEnabled ? "Open status" : "Tracking"}</span><b>{email.selfTest ? "Self-test · excluded" : email.firstOpenedAt ? formatTime(email.firstOpenedAt) : email.trackingEnabled ? "No open observed" : "Off"}</b></div>
          <div className="open-count"><b>{email.selfTest ? "—" : email.openCount}</b><span>{email.selfTest ? "ignored" : `${email.clickCount || 0} click${(email.clickCount || 0) === 1 ? "" : "s"}`}</span></div>
          {(email.opens?.length > 0 || email.clicks?.length > 0) && <details className="event-details"><summary>{email.selfTest ? "View ignored event history" : "View observed open and click history"}</summary><div>{email.opens.map((event, index) => <p key={`open-${event.observedAt}-${index}`}><b>Open · {formatTime(event.observedAt)}</b><span>{event.userAgent}</span></p>)}{(email.clicks || []).map((event, index) => <p key={`click-${event.observedAt}-${index}`}><b>Link click · {formatTime(event.observedAt)}</b><span>{event.url}</span></p>)}</div></details>}
        </article>)}</div>}
      </section>
    </>}
  </div>;
}
