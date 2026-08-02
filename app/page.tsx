"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { markdownToHtml } from "@/lib/markdown";

type Draft = {
  companyUrl: string;
  companyName: string;
  companySummary: string;
  evidence: string[];
  contributionIdeas: string[];
  selectedProjects: Array<{
    title: string;
    liveUrl: string;
    repoUrl: string;
    reason: string;
  }>;
  subject: string;
  body: string;
  demo?: boolean;
};

type Project = {
  id: string;
  title: string;
  description: string;
  liveUrl: string;
  repoUrl: string;
};

type Profile = {
  name: string;
  role: string;
  context: string;
  portfolio: string;
  linkedin: string;
  projects: Project[];
  template: string;
};

const initialProfile: Profile = {
  name: "Aksh Kaushik",
  role: "Product-minded software engineer",
  context:
    "I am a third-year BITS Pilani student who builds AI workflow products, full-stack systems, data pipelines, fintech tools, and developer utilities. I enjoy turning ambiguous startup problems into practical, inspectable products.",
  portfolio: "https://github.com/akshhkaushik",
  linkedin: "",
  projects: [],
  template:
    "I’m Aksh, a third-year BITS Pilani student and product-minded engineer. I build AI workflow products, full-stack systems, data pipelines, fintech tools, and developer utilities. Please represent the most relevant work from my researched GitHub portfolio, propose one small feature I could contribute to this company, and ask to explore joining their team. Mention that my résumé is attached.",
};

const PROFILE_STORAGE_KEY = "signal-profile";
const GMAIL_CONNECTION_KEY = "signal-gmail-autoconnect";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
          }) => { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
          revoke: (accessToken: string, callback: () => void) => void;
        };
      };
    };
  }
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export default function Home() {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [companyUrl, setCompanyUrl] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "researching" | "ready" | "sending" | "sent">("idle");
  const [notice, setNotice] = useState("");
  const [gmailToken, setGmailToken] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [profileRestored, setProfileRestored] = useState(false);
  const [profileOpen, setProfileOpen] = useState(true);
  const tokenClientRef = useRef<{ requestAccessToken: (overrideConfig?: { prompt?: string }) => void } | null>(null);
  const tokenRefreshTimerRef = useRef<number | null>(null);
  const silentReconnectRef = useRef(false);
  const initializedClientIdRef = useRef("");

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<Profile>;
          setProfile({
            ...initialProfile,
            ...parsed,
            name: typeof parsed.name === "string" ? parsed.name : initialProfile.name,
            role: typeof parsed.role === "string" ? parsed.role : initialProfile.role,
            context: typeof parsed.context === "string" ? parsed.context : initialProfile.context,
            portfolio: typeof parsed.portfolio === "string" ? parsed.portfolio : initialProfile.portfolio,
            linkedin: typeof parsed.linkedin === "string" ? parsed.linkedin : initialProfile.linkedin,
            template: typeof parsed.template === "string" ? parsed.template : initialProfile.template,
            projects: Array.isArray(parsed.projects) ? parsed.projects : [],
          });
        } catch {
          localStorage.removeItem(PROFILE_STORAGE_KEY);
        }
      }
      setProfileRestored(true);
    }, 0);
    fetch("/api/config")
      .then((response) => response.json())
      .then((data) => setGoogleClientId(data.googleClientId || ""))
      .catch(() => undefined);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!profileRestored) return;
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }, [profile, profileRestored]);

  useEffect(() => {
    if (!googleClientId || !googleScriptReady || !window.google || initializedClientIdRef.current === googleClientId) return;
    initializedClientIdRef.current = googleClientId;
    const requestSilently = () => {
      silentReconnectRef.current = true;
      tokenClientRef.current?.requestAccessToken({ prompt: "" });
    };
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: "https://www.googleapis.com/auth/gmail.send",
      callback: (response) => {
        const wasSilent = silentReconnectRef.current;
        silentReconnectRef.current = false;
        if (response.access_token) {
          setGmailToken(response.access_token);
          localStorage.setItem(GMAIL_CONNECTION_KEY, "true");
          setNotice(wasSilent ? "Gmail reconnected automatically." : "Gmail connected and will reconnect automatically on this browser.");
          if (tokenRefreshTimerRef.current) window.clearTimeout(tokenRefreshTimerRef.current);
          const refreshAfterMs = Math.max(((response.expires_in || 3600) - 120) * 1000, 60_000);
          tokenRefreshTimerRef.current = window.setTimeout(requestSilently, refreshAfterMs);
        } else if (wasSilent) {
          setGmailToken("");
          setNotice("Google needs you to reconnect Gmail once to continue sending.");
        } else {
          setNotice("Gmail connection was not completed.");
        }
      },
    });
    if (localStorage.getItem(GMAIL_CONNECTION_KEY) === "true") requestSilently();
    return () => {
      if (tokenRefreshTimerRef.current) window.clearTimeout(tokenRefreshTimerRef.current);
    };
  }, [googleClientId, googleScriptReady]);

  const step = status === "sent" ? 4 : draft ? 3 : status === "researching" ? 2 : 1;
  const companyHost = useMemo(() => {
    if (companyUrl) return hostFromUrl(companyUrl);
    return recipientEmail.split("@")[1] || "the company";
  }, [companyUrl, recipientEmail]);

  function updateProfile(field: Exclude<keyof Profile, "projects">, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function connectGmail() {
    if (!googleClientId) {
      setNotice("Gmail is not configured yet. Add GOOGLE_CLIENT_ID to the Vercel project, then redeploy.");
      return;
    }
    if (!tokenClientRef.current) {
      setNotice("Google sign-in is still loading. Please try again in a moment.");
      return;
    }
    silentReconnectRef.current = false;
    tokenClientRef.current.requestAccessToken();
  }

  function disconnectGmail() {
    const finishDisconnect = () => {
      if (tokenRefreshTimerRef.current) window.clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
      localStorage.removeItem(GMAIL_CONNECTION_KEY);
      setGmailToken("");
      setNotice("Gmail disconnected from Signal on this browser.");
    };
    if (gmailToken && window.google) {
      window.google.accounts.oauth2.revoke(gmailToken, finishDisconnect);
    } else {
      finishDisconnect();
    }
  }

  async function generateDraft(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setStatus("researching");
    setDraft(null);
    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyUrl,
          recipientEmail,
          recipientName,
          profile,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create the draft.");
      setDraft(result);
      setSubject(result.subject);
      setBody(result.body);
      setStatus("ready");
      setNotice(result.demo ? "Preview draft created. Configure AI Gateway or an OpenAI fallback to enable live website research." : "Research complete. Review every claim before sending.");
    } catch (error) {
      setStatus("idle");
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  async function sendEmail() {
    if (!gmailToken) {
      connectGmail();
      return;
    }
    if (!resume) {
      setNotice("Attach your résumé before sending.");
      return;
    }
    setStatus("sending");
    setNotice("");
    try {
      const resumeBase64 = await fileToBase64(resume);
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gmailToken}`,
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject,
          body,
          resume: {
            name: resume.name,
            type: resume.type || "application/pdf",
            base64: resumeBase64,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gmail could not send this message.");
      setStatus("sent");
      setNotice(`Sent to ${recipientEmail}. Gmail message ID: ${result.id}`);
    } catch (error) {
      setStatus("ready");
      setNotice(error instanceof Error ? error.message : "The email was not sent.");
    }
  }

  return (
    <main className="app-shell">
      <Script
        id="google-identity-script"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setGoogleScriptReady(true)}
      />
      <header className="topbar">
        <a className="brand" href="#" aria-label="Signal home">
          <span className="brand-mark">S</span>
          <span>Signal</span>
        </a>
        <div className="privacy-note"><span className="privacy-dot" /> Review-first outreach</div>
        <button
          className={`connection ${gmailToken ? "connected" : ""}`}
          onClick={gmailToken ? disconnectGmail : connectGmail}
          type="button"
          title={gmailToken ? "Disconnect Gmail" : "Connect Gmail"}
        >
          <span>{gmailToken ? "●" : "○"}</span>
          {gmailToken ? "Gmail connected · Disconnect" : "Connect Gmail"}
        </button>
      </header>

      <div className="workspace">
        <aside className={`profile-panel ${profileOpen ? "" : "collapsed"}`}>
          <button className="profile-toggle" type="button" onClick={() => setProfileOpen(!profileOpen)}>
            <span>Your context</span><span>{profileOpen ? "−" : "+"}</span>
          </button>
          {profileOpen && (
            <div className="profile-content">
              <p className="aside-copy">Your researched profile and core email are saved exactly in this browser and shape every draft.</p>
              <div className="portfolio-research-card">
                <span>✓</span>
                <div>
                  <b>GitHub portfolio researched</b>
                  <small>28 original project repositories · 10 startup capability areas · live, substantial, prototype, and learning work separated</small>
                  <a href="https://github.com/akshhkaushik" target="_blank" rel="noreferrer">View GitHub ↗</a>
                </div>
              </div>
              <label>
                Core email content
                <textarea rows={10} value={profile.template} onChange={(e) => updateProfile("template", e.target.value)} />
              </label>
              <div className="template-help">
                Saved automatically and never replaced unless you edit it. Signal preserves its meaning while adapting the email and adding a company-specific feature pitch.
              </div>
              <details className="profile-advanced">
                <summary>Optional personal overrides</summary>
                <label>
                  Your name
                  <input value={profile.name} onChange={(e) => updateProfile("name", e.target.value)} placeholder="Aksh Kaushik" />
                </label>
                <label>
                  Role you want
                  <input value={profile.role} onChange={(e) => updateProfile("role", e.target.value)} />
                </label>
                <label>
                  Additional context
                  <textarea rows={5} value={profile.context} onChange={(e) => updateProfile("context", e.target.value)} />
                </label>
                <label>
                  Portfolio URL
                  <input value={profile.portfolio} onChange={(e) => updateProfile("portfolio", e.target.value)} placeholder="https://…" />
                </label>
                <label>
                  LinkedIn URL
                  <input value={profile.linkedin} onChange={(e) => updateProfile("linkedin", e.target.value)} placeholder="https://…" />
                </label>
              </details>
            </div>
          )}
        </aside>

        <section className="main-panel">
          <div className="hero">
            <p className="eyebrow">PERSONAL OUTREACH, GROUNDED IN REAL RESEARCH</p>
            <h1>Write the email they’ll actually read.</h1>
            <p className="hero-copy">Enter a work email. Signal identifies and researches the company, matches it against your GitHub portfolio, and prepares one honest, specific introduction.</p>
          </div>

          <nav className="steps" aria-label="Progress">
            {["Target", "Research", "Review", "Sent"].map((label, index) => (
              <div className={`step ${step >= index + 1 ? "active" : ""}`} key={label}>
                <span>{step > index + 1 ? "✓" : index + 1}</span>
                <b>{label}</b>
              </div>
            ))}
          </nav>

          <form className="target-card" onSubmit={generateDraft}>
            <div className="section-heading">
              <div>
                <span className="number">01</span>
                <div><h2>Choose your target</h2><p>One thoughtful email at a time.</p></div>
              </div>
              <span className="required-note">Only the recipient email is needed to create a draft</span>
            </div>
            <div className="form-grid">
              <label className="wide">
                Recipient email *
                <div className="input-with-icon"><span>@</span><input required type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="founder@company.com" /></div>
              </label>
              <label>
                Recipient name
                <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="First name, if known" />
              </label>
              <label className="wide">
                Résumé attachment <span className="label-note">(needed only when sending)</span>
                <div className={`file-drop ${resume ? "has-file" : ""}`}>
                  <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] || null)} />
                  <span className="file-icon">{resume ? "✓" : "＋"}</span>
                  <div><b>{resume ? resume.name : "Choose your résumé"}</b><small>{resume ? `${(resume.size / 1024 / 1024).toFixed(2)} MB · ready to attach` : "PDF or DOCX · up to 8 MB · used only for this email"}</small></div>
                </div>
              </label>
              <details className="company-override wide">
                <summary>Company website override (usually not needed)</summary>
                <label>
                  Website URL
                  <div className="input-with-icon"><span>↗</span><input type="url" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} placeholder="https://company.com" /></div>
                </label>
                <p>Use this only for personal email addresses such as Gmail, or when the company’s email domain differs from its website.</p>
              </details>
            </div>
            <button className="primary-button" disabled={status === "researching"} type="submit">
              {status === "researching" ? <><span className="spinner" /> Researching {companyHost}…</> : <>Research automatically & create draft <span>→</span></>}
            </button>
          </form>

          {notice && <div className={`notice ${status === "sent" ? "success" : ""}`}>{notice}</div>}

          {draft && (
            <section className="draft-section">
              <div className="insights-card">
                <div className="company-initial">{draft.companyName.slice(0, 1)}</div>
                <div>
                  <p className="eyebrow">RESEARCH SNAPSHOT</p>
                  <h2>{draft.companyName}</h2>
                  <p>{draft.companySummary}</p>
                </div>
                <a href={draft.companyUrl} target="_blank" rel="noreferrer">Visit site ↗</a>
                <div className="insight-columns">
                  <div><h3>Details used</h3><ul>{draft.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div><h3>Where you could help</h3><ul>{draft.contributionIdeas.map((item) => <li key={item}>{item}</li>)}</ul></div>
                </div>
                {draft.selectedProjects.length > 0 && (
                  <div className="matched-projects">
                    <h3>Projects selected for this email</h3>
                    {draft.selectedProjects.map((project) => (
                      <div key={`${project.title}-${project.liveUrl}`}>
                        <a href={project.liveUrl} target="_blank" rel="noreferrer">{project.title} ↗</a>
                        <span>{project.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="editor-card">
                <div className="editor-top">
                  <div><p className="eyebrow">FINAL REVIEW</p><h2>Edit before you send</h2></div>
                  <span className="editable-pill">Everything is editable</span>
                </div>
                <label>To<input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} /></label>
                <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
                <div className="formatted-preview">
                  <div className="formatted-preview-heading">
                    <span>Email as the recipient will see it</span>
                    <small>Highlighted terms and project titles carry their links</small>
                  </div>
                  <div
                    className="formatted-preview-body"
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(body) }}
                  />
                </div>
                <details className="source-editor">
                  <summary>Edit email wording</summary>
                  <label>
                    Message source
                    <textarea rows={17} value={body} onChange={(e) => setBody(e.target.value)} />
                  </label>
                  <p>Use **bold text** and [linked text](https://example.com). The recipient receives the formatted version above.</p>
                </details>
                <div className="attachment-row"><span>▣</span><div><b>{resume?.name || "No résumé attached"}</b><small>{resume ? "Will be attached to this email" : "Choose a file above before sending"}</small></div></div>
                <div className="send-footer">
                  <p><b>You are in control.</b><br />Signal will send exactly what you see above.</p>
                  <button className="send-button" type="button" disabled={status === "sending" || status === "sent"} onClick={sendEmail}>
                    {status === "sending" ? "Sending…" : status === "sent" ? "Email sent ✓" : gmailToken ? "Approve & send email →" : "Connect Gmail to send →"}
                  </button>
                </div>
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("Please choose a résumé smaller than 8 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the résumé."));
    reader.readAsDataURL(file);
  });
}
