"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Evidence, IntelligenceField, ResearchRun, StartupIntelligence } from "@/lib/intelligence/types";
import type { Startup } from "@/lib/discovery/types";
import type { OpportunityScorecard } from "@/lib/scoring/types";
import type { ContributionOpportunity, ContributionStatus } from "@/lib/contributions/types";
import type { BuildSpec, BuildStatus } from "@/lib/builds/types";
import type { OutreachDraftAudit, OutreachMode } from "@/lib/outreach/types";
import type { FounderContact } from "@/lib/contacts/types";

type IntelligenceResponse = { startup: Startup; intelligence: StartupIntelligence | null; evidence: Evidence[]; runs: ResearchRun[]; scorecard: OpportunityScorecard | null };
type ContributionsResponse = { opportunities: ContributionOpportunity[] };
type Props = { startupId: string; gmailToken: string; autoResearch?: boolean; onClose: () => void; onTokenExpired: () => void };

async function request<T>(path: string, token: string, method = "GET", payload?: unknown) {
  const response = await fetch(path, { method, body: payload === undefined ? undefined : JSON.stringify(payload), headers: { Authorization: `Bearer ${token}`, ...(payload === undefined ? {} : { "Content-Type": "application/json" }) }, cache: "no-store" });
  const responseBody = await response.json() as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(responseBody.error || "Startup intelligence request failed."), { status: response.status });
  return responseBody;
}

function display(value: unknown): string {
  if (value === "unknown" || value === null || value === undefined) return "Unknown";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(display).join(", ");
  return JSON.stringify(value);
}

export default function StartupIntelligencePanel({ startupId, gmailToken, autoResearch = false, onClose, onTokenExpired }: Props) {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [opportunities, setOpportunities] = useState<ContributionOpportunity[]>([]);
  const [builds, setBuilds] = useState<BuildSpec[]>([]);
  const [outreachDrafts, setOutreachDrafts] = useState<OutreachDraftAudit[]>([]);
  const [contacts, setContacts] = useState<FounderContact[]>([]);
  const [contactProviderConfigured, setContactProviderConfigured] = useState(false);
  const [recipient, setRecipient] = useState({ email: "", name: "", contactId: "" });
  const [outreachMode, setOutreachMode] = useState<OutreachMode>("contribution");
  const [activeDraft, setActiveDraft] = useState<OutreachDraftAudit | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [busy, setBusy] = useState<string>("loading");
  const [notice, setNotice] = useState("");
  const autoResearchStartupRef = useRef("");
  const autoContactStartupRef = useRef("");
  const evidenceById = useMemo(() => new Map((data?.evidence || []).map((item) => [item.id, item])), [data]);

  const handleError = useCallback((error: unknown) => {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    if (status === 401) onTokenExpired();
    setNotice(error instanceof Error ? error.message : "Startup intelligence request failed.");
  }, [onTokenExpired]);

  const load = useCallback(async () => {
    setBusy("loading");
    try {
      const [intelligenceResult, contributionResult, buildResult, outreachResult, contactResult] = await Promise.all([
        request<IntelligenceResponse>(`/api/startups/${startupId}/intelligence`, gmailToken),
        request<ContributionsResponse>(`/api/startups/${startupId}/contributions`, gmailToken),
        request<{ builds: BuildSpec[] }>(`/api/startups/${startupId}/builds`, gmailToken),
        request<{ drafts: OutreachDraftAudit[] }>(`/api/startups/${startupId}/outreach`, gmailToken),
        request<{ contacts: FounderContact[]; providerConfigured: boolean }>(`/api/startups/${startupId}/contacts`, gmailToken),
      ]);
      setData(intelligenceResult);
      setOpportunities(contributionResult.opportunities);
      setBuilds(buildResult.builds); setOutreachDrafts(outreachResult.drafts);
      setContacts(contactResult.contacts); setContactProviderConfigured(contactResult.providerConfigured);
    }
    catch (error) { handleError(error); }
    finally { setBusy(""); }
  }, [gmailToken, handleError, startupId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    autoResearchStartupRef.current = "";
    autoContactStartupRef.current = "";
  }, [startupId]);

  useEffect(() => {
    if (!autoResearch || busy || !data || data.intelligence || autoResearchStartupRef.current === startupId) return;
    const timer = window.setTimeout(async () => {
      autoResearchStartupRef.current = startupId;
      setBusy("researching"); setNotice("Researching the selected startup from bounded public sources…");
      try {
        const result = await request<{ run: ResearchRun; evidenceCreated: number; evidenceReused: number }>(`/api/startups/${startupId}/research`, gmailToken, "POST");
        setNotice(`Research ${result.run.status}: ${result.evidenceCreated} new evidence record${result.evidenceCreated === 1 ? "" : "s"}, ${result.evidenceReused} reused.`);
        await load();
      } catch (error) { handleError(error); }
      finally { setBusy(""); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoResearch, busy, data, gmailToken, handleError, load, startupId]);

  useEffect(() => {
    const founders = data?.intelligence?.founders.value;
    if (!autoResearch || busy || !Array.isArray(founders) || founders.length === 0 || contacts.length > 0 || autoContactStartupRef.current === startupId) return;
    const timer = window.setTimeout(async () => {
      autoContactStartupRef.current = startupId;
      setBusy("contacts"); setNotice("Checking ordered founder-email patterns against the company domain…");
      try {
        const result = await request<{ contacts: FounderContact[]; providerConfigured: boolean }>(`/api/startups/${startupId}/contacts`, gmailToken, "POST", {});
        setContacts(result.contacts); setContactProviderConfigured(result.providerConfigured);
        const usable = result.contacts.find((contact) => contact.email && (contact.verificationStatus === "valid" || (contact.verificationStatus === "accept_all" && contact.confidence >= 85)));
        if (usable?.email) setRecipient({ email: usable.email, name: usable.founderName, contactId: usable.id });
        setNotice(usable ? `Verified founder contact selected for ${usable.founderName}.` : result.providerConfigured ? "Research is ready, but no safely verified founder email was returned." : "Research is ready. Email patterns were generated, but an email-finder provider is required to verify them before use.");
      } catch (error) { handleError(error); }
      finally { setBusy(""); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoResearch, busy, contacts.length, data?.intelligence?.founders.value, gmailToken, handleError, startupId]);

  async function research() {
    setBusy("researching"); setNotice("");
    try {
      const result = await request<{ run: ResearchRun; evidenceCreated: number; evidenceReused: number }>(`/api/startups/${startupId}/research`, gmailToken, "POST");
      setNotice(`Research ${result.run.status}: ${result.evidenceCreated} new evidence record${result.evidenceCreated === 1 ? "" : "s"}, ${result.evidenceReused} reused.`);
      await load();
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  }

  async function suggestOpportunities() {
    setBusy("suggesting"); setNotice("");
    try {
      const result = await request<{ generated: number; opportunities: ContributionOpportunity[] }>(`/api/startups/${startupId}/contributions`, gmailToken, "POST");
      setOpportunities(result.opportunities);
      setNotice(result.generated > 0 ? `${result.generated} evidence-backed contribution suggestion${result.generated === 1 ? "" : "s"} generated.` : "No contribution met the evidence, startup-score, and project-match requirements.");
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  }

  async function updateOpportunity(id: string, status: ContributionStatus) {
    setBusy(`status:${id}`); setNotice("");
    try {
      const result = await request<{ opportunity: ContributionOpportunity }>(`/api/startups/${startupId}/contributions/${id}`, gmailToken, "PATCH", { status });
      setOpportunities((current) => current.map((item) => item.id === id ? result.opportunity : item));
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  }

  async function generateSpec(id: string) {
    setBusy(`spec:${id}`); setNotice("");
    try {
      const result = await request<{ opportunity: ContributionOpportunity }>(`/api/startups/${startupId}/contributions/${id}/build-spec`, gmailToken, "POST");
      setOpportunities((current) => current.map((item) => item.id === id ? result.opportunity : item));
      setNotice("Build-before-ask specification generated. No code or external repository was changed.");
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  }

  async function createBuild(opportunityId: string) {
    setBusy(`build:${opportunityId}`); setNotice("");
    try { const result = await request<{ build: BuildSpec }>(`/api/startups/${startupId}/builds`, gmailToken, "POST", { opportunityId }); setBuilds((current) => [result.build, ...current.filter((item) => item.id !== result.build.id)]); }
    catch (error) { handleError(error); } finally { setBusy(""); }
  }

  async function updateBuild(buildId: string, status: BuildStatus) {
    setBusy(`build-status:${buildId}`); setNotice("");
    try { const result = await request<{ build: BuildSpec }>(`/api/startups/${startupId}/builds/${buildId}`, gmailToken, "PATCH", { status }); setBuilds((current) => current.map((item) => item.id === buildId ? result.build : item)); }
    catch (error) { handleError(error); } finally { setBusy(""); }
  }

  async function attachProof(buildId: string, form: HTMLFormElement) {
    const values = new FormData(form); setBusy(`proof:${buildId}`); setNotice("");
    try { const result = await request<{ build: BuildSpec }>(`/api/startups/${startupId}/builds/${buildId}?action=proof`, gmailToken, "PATCH", Object.fromEntries(values)); setBuilds((current) => current.map((item) => item.id === buildId ? result.build : item)); setNotice("User-provided proof attached. Mark the build completed before using proof-based outreach."); }
    catch (error) { handleError(error); } finally { setBusy(""); }
  }

  async function draftOutreach(opportunityId: string) {
    setBusy(`outreach:${opportunityId}`); setNotice("");
    try { const result = await request<{ draft: OutreachDraftAudit }>(`/api/startups/${startupId}/outreach`, gmailToken, "POST", { opportunityId, mode: outreachMode, recipientEmail: recipient.email, recipientName: recipient.name, recipientContactId: recipient.contactId || null }); setActiveDraft(result.draft); setOutreachDrafts((current) => [result.draft, ...current]); }
    catch (error) { handleError(error); } finally { setBusy(""); }
  }

  async function discoverFounderEmails(founderName?: string) {
    setBusy("contacts"); setNotice("");
    try {
      const result = await request<{ contacts: FounderContact[]; providerConfigured: boolean }>(`/api/startups/${startupId}/contacts`, gmailToken, "POST", founderName ? { founderName } : {});
      setContacts(result.contacts); setContactProviderConfigured(result.providerConfigured);
      const usable = result.contacts.find((contact) => contact.email && (contact.verificationStatus === "valid" || (contact.verificationStatus === "accept_all" && contact.confidence >= 85)));
      if (usable?.email) setRecipient({ email: usable.email, name: usable.founderName, contactId: usable.id });
      setNotice(usable ? `Verified founder contact selected for ${usable.founderName}. Review the draft before sending.` : result.providerConfigured ? "No safely verified founder email was returned. Guessed candidates remain disabled." : "Email patterns were generated, but Snov.io is not configured, so no guessed address can be used.");
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  }

  function selectContact(contact: FounderContact) {
    if (!contact.email || !(contact.verificationStatus === "valid" || (contact.verificationStatus === "accept_all" && contact.confidence >= 85))) return;
    setRecipient({ email: contact.email, name: contact.founderName, contactId: contact.id });
  }

  async function validateDraft() {
    if (!activeDraft) return; setBusy("validating"); setNotice("");
    try { const result = await request<{ draft: OutreachDraftAudit }>(`/api/outreach/${activeDraft.id}/validate`, gmailToken, "POST", { subject: activeDraft.subject, body: activeDraft.body, recipientEmail: activeDraft.recipientEmail }); setActiveDraft(result.draft); setNotice("All detected company claims are supported by the EvidenceLedger."); }
    catch (error) { handleError(error); } finally { setBusy(""); }
  }

  async function sendAuditedDraft() {
    if (!activeDraft || !activeDraft.validation.valid) return setNotice("Validate the draft before sending.");
    if (!resume) return setNotice("Attach your résumé before sending.");
    setBusy("sending"); setNotice("");
    try { const response = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${gmailToken}` }, body: JSON.stringify({ to: activeDraft.recipientEmail, recipientName: activeDraft.recipientName, subject: activeDraft.subject, body: activeDraft.body, companyName: data?.startup.name || "", companyUrl: data?.startup.website || "", trackOpens: true, outreachDraftId: activeDraft.id, resume: { name: resume.name, type: resume.type || "application/pdf", base64: await fileToBase64(resume) } }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Gmail could not send this message."); setNotice("Email sent after explicit review. Its outcome record is ready for follow-up tracking."); await load(); }
    catch (error) { handleError(error); } finally { setBusy(""); }
  }

  const links = (ids: string[]) => <span className="claim-sources">{ids.map((id) => evidenceById.get(id)).filter((item): item is Evidence => Boolean(item)).map((item) => <a key={item.id} href={item.sourceUrl} target="_blank" rel="noreferrer" title={`${item.sourceName} · ${item.confidence} confidence`}>Source ↗</a>)}</span>;
  const field = <T,>(label: string, item: IntelligenceField<T>) => <div className="claim-row"><span>{label}</span><b>{display(item.value)}</b>{item.value !== "unknown" && links(item.evidenceIds)}</div>;
  const intelligence = data?.intelligence;

  return <section className="panel intelligence-panel" aria-label="Startup intelligence detail">
    <header className="intelligence-header"><div><p className="kicker">Evidence-backed intelligence</p><h2>{data?.startup.name || "Startup detail"}</h2><p>{intelligence ? `Last researched ${new Date(intelligence.lastResearchedAt).toLocaleString()}` : "Not researched yet"}</p></div><div><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void research()}>{busy === "researching" ? "Researching…" : intelligence ? "Research again" : "Run research"}</button><button className="close-button" type="button" onClick={onClose} aria-label="Close startup detail">×</button></div></header>
    {notice && <div className="notice" role="status">{notice}</div>}
    {busy === "loading" && !data ? <div className="table-empty"><p>Loading intelligence…</p></div>
    : !intelligence ? <div className="table-empty"><h3>No intelligence record yet</h3><p>Run bounded research to inspect the company homepage, existing accelerator provenance, and at most one same-origin jobs page.</p></div>
    : <>
      {data?.scorecard && <section className="scorecard-section" aria-label="Opportunity score breakdown">
        <div className="scorecard-summary"><span className={`tier-badge tier-${data.scorecard.tier.toLowerCase()}`}>{data.scorecard.tier}</span><div><p className="kicker">Aksh-specific opportunity score</p><b>{data.scorecard.score}<small>/100</small></b><span>{data.scorecard.scoreConfidence}% {data.scorecard.scoreConfidenceLabel} confidence · {data.scorecard.configVersion}</span></div></div>
        <div className="score-factor-list">{data.scorecard.factors.map((factor) => <article key={factor.dimension}><div><h3>{factor.label}</h3><p>{factor.reason}</p>{factor.projectMatches.length > 0 && <span className="project-matches">Matched projects: {factor.projectMatches.map((project) => <a key={project.projectId} href={project.repositoryUrl} target="_blank" rel="noreferrer">{project.projectName} ↗</a>)}</span>}</div><div className="factor-result"><b>{factor.earnedPoints}/{factor.maxPoints}</b><span>{factor.confidence}% confidence</span>{links(factor.evidenceIds)}</div></article>)}</div>
      </section>}
      <section className="contribution-section" aria-label="Contribution opportunities">
        <div className="contribution-heading"><div><p className="kicker">Contribution opportunities</p><h2>Small, evidence-backed things Aksh could demonstrate.</h2><p>Suggestions are hypotheses, not claims about internal startup needs.</p></div><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void suggestOpportunities()}>{busy === "suggesting" ? "Generating…" : opportunities.length > 0 ? "Refresh suggestions" : "Generate suggestions"}</button></div>
        {opportunities.length === 0 ? <div className="contribution-empty"><p>No saved contribution opportunities yet. Generation requires a B-tier-or-higher startup score, supporting evidence, and a demonstrated project match.</p></div>
        : <div className="contribution-list">{opportunities.map((opportunity) => <article className="contribution-card" key={opportunity.id}>
          <header><div><span className={`contribution-status status-${opportunity.status}`}>{opportunity.status}</span><span>{opportunity.type}</span><h3>{opportunity.title}</h3></div><div className="contribution-score"><b>{opportunity.contributionScore}</b><span>{opportunity.confidenceScore}% {opportunity.confidence} confidence</span></div></header>
          <div className="contribution-body"><section><h4>Why it matters</h4><p>{opportunity.problem}</p><h4>Proposed solution</h4><p>{opportunity.proposedSolution}</p><h4>Expected impact</h4><p>{opportunity.expectedImpact}</p></section><aside><div><span>Effort</span><b>{opportunity.estimatedEffortHours} hours · {opportunity.estimatedDifficulty}</b></div><div><span>Aksh fit</span><b>{opportunity.relevantSkills.join(", ")}</b></div><div><span>Relevant projects</span>{opportunity.relevantAkshProjects.map((project) => <a key={project.projectId} href={project.repositoryUrl} target="_blank" rel="noreferrer">{project.projectName} ↗</a>)}</div></aside></div>
          <details className="contribution-evidence"><summary>Evidence that caused this suggestion · {opportunity.evidence.length}</summary>{opportunity.evidence.map((item) => <div key={item.evidenceId}><span className={`confidence ${item.confidence}`}>{item.confidence}</span><p><b>{item.claim}</b><span>{item.valueSummary}</span></p><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceName} ↗</a></div>)}</details>
          {opportunity.buildSpec && <details className="build-spec" open><summary>Build-before-ask specification</summary><div><h4>Problem</h4><p>{opportunity.buildSpec.problem}</p><h4>Scope</h4><p>{opportunity.buildSpec.scope}</p><h4>Proposed implementation</h4><ul>{opportunity.buildSpec.proposedImplementation.map((item) => <li key={item}>{item}</li>)}</ul><h4>Inputs</h4><ul>{opportunity.buildSpec.inputs.map((item) => <li key={item}>{item}</li>)}</ul><h4>Outputs</h4><ul>{opportunity.buildSpec.outputs.map((item) => <li key={item}>{item}</li>)}</ul><h4>Acceptance criteria</h4><ul>{opportunity.buildSpec.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}</ul><h4>Relevant APIs</h4>{opportunity.buildSpec.relevantApis.length > 0 ? <ul>{opportunity.buildSpec.relevantApis.map((item) => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.label} ↗</a></li>)}</ul> : <p>No public API was evidenced; use fixtures only.</p>}<h4>Potential demo</h4><p>{opportunity.buildSpec.potentialDemo}</p></div></details>}
          <footer><div>{opportunity.status === "suggested" && <button type="button" className="approve-button" disabled={Boolean(busy)} onClick={() => void updateOpportunity(opportunity.id, "approved")}>Approve</button>}{["suggested", "approved", "building"].includes(opportunity.status) && <button type="button" className="reject-button" disabled={Boolean(busy)} onClick={() => void updateOpportunity(opportunity.id, "rejected")}>Reject</button>}<button type="button" disabled={Boolean(busy)} onClick={() => void generateSpec(opportunity.id)}>{busy === `spec:${opportunity.id}` ? "Generating…" : opportunity.buildSpec ? "Regenerate Build Spec" : "Generate Build Spec"}</button>{["approved", "building", "built"].includes(opportunity.status) && data?.scorecard?.tier === "S" && <button type="button" disabled={Boolean(busy)} onClick={() => void createBuild(opportunity.id)}>Open Build Workflow</button>}</div><small>Score components: evidence {opportunity.contributionScoreBreakdown.evidenceStrength}, startup relevance {opportunity.contributionScoreBreakdown.startupRelevance}, Aksh relevance {opportunity.contributionScoreBreakdown.akshRelevance}, effort {opportunity.contributionScoreBreakdown.effortFit}, impact {opportunity.contributionScoreBreakdown.expectedImpact}.</small></footer>
        </article>)}</div>}
      </section>
      <section className="workflow-section build-workflow"><div className="contribution-heading"><div><p className="kicker">Build</p><h2>Turn an approved S-tier idea into verifiable proof.</h2></div></div>{builds.length === 0 ? <p className="unknown-copy">No Phase 6 build workflow yet.</p> : builds.map((build) => <article className="workflow-card" key={build.id}><header><h3>{build.title}</h3><span className={`contribution-status status-${build.status}`}>{build.status}</span></header><div className="known-assumption-grid"><div><h4>Known from public evidence</h4>{build.knownFromPublicEvidence.map((item) => <p key={item.evidenceId}>{item.valueSummary}</p>)}</div><div><h4>Assumptions</h4>{build.assumptions.map((item) => <p key={item}>{item}</p>)}</div></div><details><summary>Technical specification</summary><p>{build.scope}</p><ul>{build.implementationPlan.map((item) => <li key={item}>{item}</li>)}</ul><b>Architecture</b><ul>{build.architecture.map((item) => <li key={item}>{item}</li>)}</ul><b>Acceptance criteria</b><ul>{build.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}</ul><p>{build.demoIdea}</p></details><form onSubmit={(event) => { event.preventDefault(); void attachProof(build.id, event.currentTarget); }}><input name="githubUrl" type="url" placeholder="GitHub URL" defaultValue={build.proof?.githubUrl} /><input name="demoUrl" type="url" placeholder="Demo URL" defaultValue={build.proof?.demoUrl} /><input name="prUrl" type="url" placeholder="PR URL" defaultValue={build.proof?.prUrl} /><input name="documentationUrl" type="url" placeholder="Documentation URL" defaultValue={build.proof?.documentationUrl} /><input name="screenshotUrl" type="url" placeholder="Screenshot URL" defaultValue={build.proof?.screenshotUrl} /><textarea name="notes" placeholder="Proof notes" defaultValue={build.proof?.notes} /><button type="submit">Attach proof</button></form><footer>{build.status === "draft" && <button onClick={() => void updateBuild(build.id, "approved")}>Approve spec</button>}{build.status === "approved" && <button onClick={() => void updateBuild(build.id, "building")}>Start building</button>}{build.status === "building" && <button onClick={() => void updateBuild(build.id, "completed")}>Mark completed</button>}</footer></article>)}</section>
      <section className="workflow-section contact-discovery"><div className="contribution-heading"><div><p className="kicker">Founder contact</p><h2>Find a verified company email.</h2><p>Checks saved successful contacts first, then asks the configured provider for the founder at the company domain. Only a deliverable result becomes selectable.</p></div><button className="secondary-button" type="button" disabled={Boolean(busy) || intelligence.founders.value === "unknown"} onClick={() => void discoverFounderEmails()}>{busy === "contacts" ? "Checking…" : contacts.length ? "Check again" : "Find founder emails"}</button></div>{!contactProviderConfigured && <div className="accuracy-note"><b>Verification unavailable:</b> add SNOV_CLIENT_ID and SNOV_CLIENT_SECRET in Vercel. Until then, generated combinations remain unverified and disabled for automated selection.</div>}<div className="contact-list">{contacts.map((contact) => { const usable = Boolean(contact.email) && (contact.verificationStatus === "valid" || (contact.verificationStatus === "accept_all" && contact.confidence >= 85)); return <article className="contact-card" key={contact.id}><header><div><h3>{contact.founderName}</h3><p>{contact.founderRole}</p></div><span className={`contact-status status-${contact.verificationStatus}`}>{contact.verificationStatus.replace("_", "-")}</span></header>{contact.email ? <p className="contact-email">{contact.email}</p> : <p className="unknown-copy">No verified address found.</p>}<p>{contact.origin === "public" ? `Publicly sourced from ${contact.sourceUrls.length} page${contact.sourceUrls.length === 1 ? "" : "s"}.` : contact.origin === "inferred" ? `Pattern-inferred and checked by ${contact.provider}.` : `${contact.candidates.length} likely combinations generated but not treated as facts.`}</p><details><summary>Inspect ordered verification attempts</summary><ol>{contact.candidates.map((candidate) => <li key={candidate.email}><b>#{candidate.rank} {candidate.pattern}</b>: {candidate.email} · {candidate.verificationStatus}{candidate.confidence ? ` (${candidate.confidence}%)` : ""}</li>)}</ol>{contact.sourceUrls.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">Public source ↗</a>)}</details><button type="button" disabled={!usable} onClick={() => selectContact(contact)}>{recipient.contactId === contact.id ? "Selected" : usable ? "Use for outreach" : "Verification required"}</button></article>; })}</div></section>
      <section className="workflow-section outreach-workflow"><div className="contribution-heading"><div><p className="kicker">Outreach</p><h2>Draft from approved evidence and proof.</h2><p>Build-before-ask modes unlock only after completion and attached proof.</p></div></div><div className="outreach-controls"><input type="email" value={recipient.email} onChange={(event) => setRecipient({ ...recipient, email: event.target.value, contactId: "" })} placeholder="Verified founder email or manual recipient" /><input value={recipient.name} onChange={(event) => setRecipient({ ...recipient, name: event.target.value })} placeholder="Recipient name" /><select value={outreachMode} onChange={(event) => setOutreachMode(event.target.value as OutreachMode)}><option value="contribution">Contribution</option><option value="build_before_ask">Build-before-ask</option><option value="open_source">Open-source / product</option></select></div><div className="outreach-opportunities">{opportunities.filter((item) => ["approved", "building", "built"].includes(item.status)).map((item) => <button key={item.id} type="button" disabled={Boolean(busy)} onClick={() => void draftOutreach(item.id)}>Draft Outreach · {item.title}</button>)}</div>{activeDraft && <article className="outreach-review"><header><b>{activeDraft.validation.valid ? "Validated" : "Needs validation"}</b><span>{activeDraft.model} · {activeDraft.contextVersion}</span></header><input disabled={Boolean(activeDraft.recipientContactId)} value={activeDraft.recipientEmail} onChange={(event) => setActiveDraft({ ...activeDraft, recipientEmail: event.target.value, validation: { ...activeDraft.validation, valid: false } })} /><input value={activeDraft.subject} onChange={(event) => setActiveDraft({ ...activeDraft, subject: event.target.value, validation: { ...activeDraft.validation, valid: false } })} /><textarea rows={16} value={activeDraft.body} onChange={(event) => setActiveDraft({ ...activeDraft, body: event.target.value, validation: { ...activeDraft.validation, valid: false } })} /><details open><summary>Detected factual claims and evidence</summary>{activeDraft.detectedClaims.map((claim) => <p key={claim.text}>{claim.text} — {claim.evidenceIds.length} evidence record{claim.evidenceIds.length === 1 ? "" : "s"}</p>)}{activeDraft.validation.unsupportedClaims.map((claim) => <p key={claim} className="invalid-claim">Unsupported: {claim}</p>)}</details><label>Résumé<input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setResume(event.target.files?.[0] || null)} /></label><footer><button type="button" onClick={() => void validateDraft()}>Validate claims</button><button className="send-button" type="button" disabled={!activeDraft.validation.valid || busy === "sending"} onClick={() => void sendAuditedDraft()}>{busy === "sending" ? "Sending…" : "Review complete · Send email"}</button></footer></article>}<small>{outreachDrafts.length} auditable draft{outreachDrafts.length === 1 ? "" : "s"} stored for this startup.</small></section>
      <div className="intelligence-grid">
        <section><h3>Company</h3>{field("Description", intelligence.company.description)}{field("Industry", intelligence.company.industry)}{field("Location", intelligence.company.location)}{field("Founded", intelligence.company.foundedYear)}</section>
        <section><h3>Funding</h3>{field("Latest round", intelligence.funding.latestRound)}{field("Days since latest funding", intelligence.funding.daysSinceLatestFunding)}</section>
        <section><h3>Team observations</h3>{intelligence.team.observations.length === 0 ? <p className="unknown-copy">Unknown</p> : intelligence.team.observations.map((observation) => <div className="claim-row" key={observation.evidenceId}><span>{observation.sourceName}</span><b>{observation.count}</b>{links([observation.evidenceId])}</div>)}<div className="claim-row"><span>Derived estimate</span><b>{intelligence.team.estimate === "unknown" ? "Unknown" : intelligence.team.estimate.min === intelligence.team.estimate.max ? String(intelligence.team.estimate.min) : `${intelligence.team.estimate.min}–${intelligence.team.estimate.max}`}</b>{intelligence.team.estimate !== "unknown" && links(intelligence.team.estimate.evidenceIds)}</div></section>
        <section><h3>Founders</h3>{intelligence.founders.value === "unknown" ? <p className="unknown-copy">Unknown</p> : intelligence.founders.value.map((founder, index) => <div className="claim-row" key={`${founder.name}-${index}`}><span>{founder.role}</span><b>{founder.profileUrl === "unknown" ? founder.name : <a href={founder.profileUrl} target="_blank" rel="noreferrer">{founder.name} ↗</a>}</b>{links(intelligence.founders.evidenceIds)}</div>)}</section>
        <section><h3>Product</h3>{field("Description", intelligence.product.description)}{field("Category", intelligence.product.category)}{field("Recent launches", intelligence.product.recentLaunches)}{field("Developer information", intelligence.product.developerResources)}</section>
        <section><h3>Hiring</h3>{field("Open technical roles", intelligence.hiring.technicalRoles)}{field("Recent announcements", intelligence.hiring.recentAnnouncements)}{field("Engineering activity", intelligence.hiring.engineeringActivity)}</section>
      </div>

      <details className="evidence-ledger" open><summary>Evidence ledger · {data?.evidence.length || 0} records</summary><div>{(data?.evidence || []).map((item) => <article key={item.id}><span className={`confidence ${item.confidence}`}>{item.confidence}</span><div><b>{item.claim}</b><p>{display(item.value)}</p><small>Observed {new Date(item.observedAt).toLocaleString()}</small></div><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceName} ↗</a></article>)}</div></details>
      {(data?.runs || []).some((run) => run.errors.length > 0) && <details className="research-errors"><summary>Source limitations from recent runs</summary>{data?.runs.flatMap((run) => run.errors.map((error) => <p key={`${run.id}-${error.sourceId}`}><b>{error.sourceId}</b> — {error.message}</p>))}</details>}
    </>}
  </section>;
}

function fileToBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { if (file.size > 8 * 1024 * 1024) return reject(new Error("Please choose a résumé smaller than 8 MB.")); const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(new Error("Could not read the résumé.")); reader.readAsDataURL(file); }); }
