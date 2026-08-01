"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { markdownToHtml } from "@/lib/markdown";

type Draft = {
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
  name: "",
  role: "Product-minded software engineer",
  context:
    "I build thoughtful web products, automate repetitive work, and enjoy contributing across product and engineering.",
  portfolio: "",
  linkedin: "",
  projects: [],
  template:
    "Hi {{recipient}},\n\nI’ve been following {{company}} and was especially interested in {{company_detail}}.\n\nI’d love to contribute to the team. Based on what I learned, I could help with {{contribution}}.\n\nA couple of relevant things I’ve built:\n{{projects}}\n\nIf this is useful, I’d be glad to share a few concrete ideas or build a small proof of concept. I’ve attached my résumé for context.\n\nBest,\n{{name}}",
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
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
  const [profileOpen, setProfileOpen] = useState(true);
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const saved = localStorage.getItem("signal-profile");
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<Profile>;
          setProfile({
            ...initialProfile,
            ...parsed,
            projects: Array.isArray(parsed.projects) ? parsed.projects : [],
          });
        } catch {
          localStorage.removeItem("signal-profile");
        }
      }
    }, 0);
    fetch("/api/config")
      .then((response) => response.json())
      .then((data) => setGoogleClientId(data.googleClientId || ""))
      .catch(() => undefined);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    localStorage.setItem("signal-profile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (!googleClientId || document.querySelector("#google-identity-script")) return;
    const script = document.createElement("script");
    script.id = "google-identity-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (!window.google) return;
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: "https://www.googleapis.com/auth/gmail.send",
        callback: (response) => {
          if (response.access_token) {
            setGmailToken(response.access_token);
            setNotice("Gmail connected for this session.");
          } else {
            setNotice("Gmail connection was not completed.");
          }
        },
      });
    };
    document.head.appendChild(script);
  }, [googleClientId]);

  const step = status === "sent" ? 4 : draft ? 3 : status === "researching" ? 2 : 1;
  const companyHost = useMemo(() => hostFromUrl(companyUrl), [companyUrl]);

  function updateProfile(field: Exclude<keyof Profile, "projects">, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function addProject() {
    setProfile((current) => ({
      ...current,
      projects: [
        ...current.projects,
        { id: crypto.randomUUID(), title: "", description: "", liveUrl: "", repoUrl: "" },
      ],
    }));
  }

  function updateProject(id: string, field: keyof Omit<Project, "id">, value: string) {
    setProfile((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === id ? { ...project, [field]: value } : project,
      ),
    }));
  }

  function removeProject(id: string) {
    setProfile((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== id),
    }));
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
    tokenClientRef.current.requestAccessToken();
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
      <header className="topbar">
        <a className="brand" href="#" aria-label="Signal home">
          <span className="brand-mark">S</span>
          <span>Signal</span>
        </a>
        <div className="privacy-note"><span className="privacy-dot" /> Review-first outreach</div>
        <button
          className={`connection ${gmailToken ? "connected" : ""}`}
          onClick={connectGmail}
          type="button"
        >
          <span>{gmailToken ? "●" : "○"}</span>
          {gmailToken ? "Gmail connected" : "Connect Gmail"}
        </button>
      </header>

      <div className="workspace">
        <aside className={`profile-panel ${profileOpen ? "" : "collapsed"}`}>
          <button className="profile-toggle" type="button" onClick={() => setProfileOpen(!profileOpen)}>
            <span>Your context</span><span>{profileOpen ? "−" : "+"}</span>
          </button>
          {profileOpen && (
            <div className="profile-content">
              <p className="aside-copy">Saved in this browser and used to shape every draft.</p>
              <label>
                Your name
                <input value={profile.name} onChange={(e) => updateProfile("name", e.target.value)} placeholder="Aksh Kaushik" />
              </label>
              <label>
                Role you want
                <input value={profile.role} onChange={(e) => updateProfile("role", e.target.value)} />
              </label>
              <label>
                What you can offer
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
              <div className="projects-heading">
                <div>
                  <b>Your projects</b>
                  <small>The AI includes only the strongest match.</small>
                </div>
                <button type="button" onClick={addProject}>＋ Add</button>
              </div>
              <div className="project-list">
                {profile.projects.length === 0 && (
                  <button className="empty-project" type="button" onClick={addProject}>
                    Add a project with its live link
                  </button>
                )}
                {profile.projects.map((project, index) => (
                  <div className="project-card" key={project.id}>
                    <div className="project-card-top">
                      <span>Project {index + 1}</span>
                      <button type="button" onClick={() => removeProject(project.id)} aria-label={`Remove project ${index + 1}`}>Remove</button>
                    </div>
                    <input value={project.title} onChange={(e) => updateProject(project.id, "title", e.target.value)} placeholder="Project title" aria-label={`Project ${index + 1} title`} />
                    <textarea rows={3} value={project.description} onChange={(e) => updateProject(project.id, "description", e.target.value)} placeholder="What it does and what you built" aria-label={`Project ${index + 1} description`} />
                    <input type="url" value={project.liveUrl} onChange={(e) => updateProject(project.id, "liveUrl", e.target.value)} placeholder="Live URL (required)" aria-label={`Project ${index + 1} live URL`} />
                    <input type="url" value={project.repoUrl} onChange={(e) => updateProject(project.id, "repoUrl", e.target.value)} placeholder="Repository URL (optional)" aria-label={`Project ${index + 1} repository URL`} />
                  </div>
                ))}
              </div>
              <label>
                Writing sample (optional)
                <textarea rows={10} value={profile.template} onChange={(e) => updateProfile("template", e.target.value)} />
              </label>
              <div className="template-help">
                Used only as tone inspiration. Signal writes a fresh structure for each company and may ignore or reshape this completely.
              </div>
            </div>
          )}
        </aside>

        <section className="main-panel">
          <div className="hero">
            <p className="eyebrow">PERSONAL OUTREACH, GROUNDED IN REAL RESEARCH</p>
            <h1>Write the email they’ll actually read.</h1>
            <p className="hero-copy">Give Signal a company and a person. It finds the useful details, connects them to your strengths, and prepares one honest, specific introduction.</p>
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
              <span className="required-note">All fields marked * are required</span>
            </div>
            <div className="form-grid">
              <label className="wide">
                Company website *
                <div className="input-with-icon"><span>↗</span><input required type="url" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} placeholder="https://company.com" /></div>
              </label>
              <label>
                Recipient email *
                <div className="input-with-icon"><span>@</span><input required type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="founder@company.com" /></div>
              </label>
              <label>
                Recipient name
                <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="First name, if known" />
              </label>
              <label className="wide">
                Résumé attachment *
                <div className={`file-drop ${resume ? "has-file" : ""}`}>
                  <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] || null)} />
                  <span className="file-icon">{resume ? "✓" : "＋"}</span>
                  <div><b>{resume ? resume.name : "Choose your résumé"}</b><small>{resume ? `${(resume.size / 1024 / 1024).toFixed(2)} MB · ready to attach` : "PDF or DOCX · up to 8 MB · used only for this email"}</small></div>
                </div>
              </label>
            </div>
            <button className="primary-button" disabled={status === "researching"} type="submit">
              {status === "researching" ? <><span className="spinner" /> Researching {companyHost}…</> : <>Research company & create draft <span>→</span></>}
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
                <a href={companyUrl} target="_blank" rel="noreferrer">Visit site ↗</a>
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
                    <small>Project titles below are real embedded links</small>
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
