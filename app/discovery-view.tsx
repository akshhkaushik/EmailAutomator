"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Accelerator, Cohort, DiscoveryResult, Startup } from "@/lib/discovery/types";
import type { AcceleratorCatalogEntry } from "@/lib/discovery/accelerator-catalog";
import type { OpportunityScorecard, OpportunityTier } from "@/lib/scoring/types";

type Props = {
  gmailToken: string;
  onConnect: () => void;
  onTokenExpired: () => void;
};

async function apiRequest<T>(path: string, token: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(result.error || "Startup discovery request failed."), { status: response.status });
  return result;
}

export default function DiscoveryView({ gmailToken, onConnect, onTokenExpired }: Props) {
  const [accelerators, setAccelerators] = useState<Accelerator[]>([]);
  const [acceleratorCatalog, setAcceleratorCatalog] = useState<AcceleratorCatalogEntry[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [startups, setStartups] = useState<Startup[]>([]);
  const [scorecards, setScorecards] = useState<Record<string, OpportunityScorecard | null>>({});
  const [filterAccelerator, setFilterAccelerator] = useState("");
  const [filterCohort, setFilterCohort] = useState("");
  const [filterTier, setFilterTier] = useState<"" | OpportunityTier>("");
  const [sortBy, setSortBy] = useState<"score" | "confidence" | "name">("score");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [acceleratorForm, setAcceleratorForm] = useState({ name: "", website: "", portfolioUrl: "", description: "" });
  const [cohortForm, setCohortForm] = useState({ acceleratorId: "", name: "", year: String(new Date().getFullYear()), portfolioUrl: "", source: "public-portfolio-page" });

  const availableCohorts = useMemo(
    () => cohorts.filter((cohort) => !filterAccelerator || cohort.acceleratorId === filterAccelerator),
    [cohorts, filterAccelerator],
  );
  const rankedStartups = useMemo(() => startups.filter((startup) => {
    const scorecard = scorecards[startup.id];
    return !filterTier || scorecard?.tier === filterTier;
  }).sort((a, b) => {
    const aScore = scorecards[a.id];
    const bScore = scorecards[b.id];
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "confidence") return (bScore?.scoreConfidence || 0) - (aScore?.scoreConfidence || 0) || (bScore?.score || 0) - (aScore?.score || 0);
    return (bScore?.score || 0) - (aScore?.score || 0) || (bScore?.scoreConfidence || 0) - (aScore?.scoreConfidence || 0);
  }), [filterTier, scorecards, sortBy, startups]);

  const handleError = useCallback((error: unknown) => {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    if (status === 401) onTokenExpired();
    setNotice(error instanceof Error ? error.message : "Startup discovery request failed.");
  }, [onTokenExpired]);

  const loadData = useCallback(async () => {
    if (!gmailToken) return;
    setBusy("loading");
    try {
      const query = new URLSearchParams();
      if (filterAccelerator) query.set("acceleratorId", filterAccelerator);
      if (filterCohort) query.set("cohortId", filterCohort);
      const [acceleratorData, cohortData, opportunityData] = await Promise.all([
        apiRequest<{ accelerators: Accelerator[]; catalog: AcceleratorCatalogEntry[] }>("/api/accelerators", gmailToken),
        apiRequest<{ cohorts: Cohort[] }>("/api/cohorts", gmailToken),
        apiRequest<{ opportunities: Array<{ startup: Startup; scorecard: OpportunityScorecard | null }> }>(`/api/opportunities${query.size ? `?${query}` : ""}`, gmailToken),
      ]);
      setAccelerators(acceleratorData.accelerators);
      setAcceleratorCatalog(acceleratorData.catalog);
      setCohorts(cohortData.cohorts);
      setStartups(opportunityData.opportunities.map((item) => item.startup));
      setScorecards(Object.fromEntries(opportunityData.opportunities.map((item) => [item.startup.id, item.scorecard])));
      setCohortForm((current) => ({ ...current, acceleratorId: current.acceleratorId || acceleratorData.accelerators[0]?.id || "" }));
      setLoaded(true);
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  }, [filterAccelerator, filterCohort, gmailToken, handleError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function addAccelerator(event: FormEvent) {
    event.preventDefault();
    setBusy("accelerator"); setNotice("");
    try {
      const result = await apiRequest<{ accelerator: Accelerator }>("/api/accelerators", gmailToken, {
        method: "POST", body: JSON.stringify(acceleratorForm),
      });
      setAcceleratorForm({ name: "", website: "", portfolioUrl: "", description: "" });
      setCohortForm((current) => ({ ...current, acceleratorId: result.accelerator.id, portfolioUrl: result.accelerator.portfolioUrl }));
      setNotice(`${result.accelerator.name} was added.`);
      await loadData();
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  }

  async function addCohort(event: FormEvent) {
    event.preventDefault();
    setBusy("cohort"); setNotice("");
    try {
      const result = await apiRequest<{ cohort: Cohort }>("/api/cohorts", gmailToken, {
        method: "POST", body: JSON.stringify({ ...cohortForm, year: cohortForm.year ? Number(cohortForm.year) : null }),
      });
      setCohortForm((current) => ({ ...current, name: "", portfolioUrl: "", year: String(new Date().getFullYear()) }));
      setNotice(`${result.cohort.name} was imported.`);
      await loadData();
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  }

  async function discover(acceleratorId: string, cohortId: string | null) {
    setBusy(`discover:${cohortId || acceleratorId}`); setNotice("");
    try {
      const result = await apiRequest<DiscoveryResult>("/api/discovery", gmailToken, {
        method: "POST", body: JSON.stringify({ acceleratorId, cohortId }),
      });
      setNotice(`Discovery finished: ${result.created} new and ${result.updated} existing startup${result.extracted === 1 ? "" : "s"} from one source page.`);
      await loadData();
    } catch (error) { handleError(error); }
    finally { setBusy(""); }
  }

  function chooseCohortAccelerator(acceleratorId: string) {
    const accelerator = accelerators.find((item) => item.id === acceleratorId);
    setCohortForm((current) => ({ ...current, acceleratorId, portfolioUrl: accelerator?.portfolioUrl || current.portfolioUrl }));
  }

  function chooseCatalogAccelerator(id: string) {
    const selected = acceleratorCatalog.find((item) => item.id === id);
    if (!selected) return;
    setAcceleratorForm((current) => ({ ...current, name: selected.name, description: `Tier ${selected.tier} · ${selected.focus.join(", ")}` }));
  }

  if (!gmailToken) {
    return <div className="page-wrap discovery-page"><section className="panel analytics-empty"><span>◎</span><h2>Connect Gmail to manage discovery</h2><p>Your verified Google identity protects accelerator, cohort, and startup records. Discovery never sends email.</p><button className="primary-button compact" type="button" onClick={onConnect}>Connect Gmail</button></section></div>;
  }

  return <div className="page-wrap discovery-page">
    <header className="analytics-heading discovery-heading"><div><p className="kicker">Startup discovery</p><h1>Accelerators into an inspectable startup list.</h1><p>Add a public portfolio or cohort page, run one bounded discovery pass, and keep the source behind every result.</p></div><button className="secondary-button" type="button" onClick={() => void loadData()} disabled={Boolean(busy)}>{busy === "loading" ? "Refreshing…" : "Refresh"}</button></header>

    <div className="accuracy-note"><b>Evidence before rank:</b> discovery remains bounded to configured public pages. Opportunity scores are deterministic, explainable, and specific to Aksh&apos;s structured project catalog; sparse evidence lowers confidence. Nothing here sends outreach.</div>
    {notice && <div className="notice" role="status">{notice}</div>}

    <section className="discovery-form-grid">
      <form className="panel discovery-form" onSubmit={addAccelerator}>
        <div className="panel-heading"><div><span className="step-number">1</span><h2>Add accelerator</h2></div><span>Public URLs only</span></div>
        <label>Curated accelerator<select defaultValue="" onChange={(event) => chooseCatalogAccelerator(event.target.value)}><option value="">Choose from Aksh&apos;s list</option>{([1, 2, 3, 4] as const).map((tier) => <optgroup label={`Tier ${tier}`} key={tier}>{acceleratorCatalog.filter((item) => item.tier === tier).map((item) => <option value={item.id} key={item.id}>{item.name}{item.aliases.length ? ` (${item.aliases.join(", ")})` : ""}</option>)}</optgroup>)}</select></label>
        <label>Name *<input required value={acceleratorForm.name} onChange={(event) => setAcceleratorForm({ ...acceleratorForm, name: event.target.value })} placeholder="Example Accelerator" /></label>
        <label>Website *<input required type="url" value={acceleratorForm.website} onChange={(event) => setAcceleratorForm({ ...acceleratorForm, website: event.target.value })} placeholder="https://accelerator.example" /></label>
        <label>Portfolio URL *<input required type="url" value={acceleratorForm.portfolioUrl} onChange={(event) => setAcceleratorForm({ ...acceleratorForm, portfolioUrl: event.target.value })} placeholder="https://accelerator.example/portfolio" /></label>
        <label>Description<textarea rows={3} value={acceleratorForm.description} onChange={(event) => setAcceleratorForm({ ...acceleratorForm, description: event.target.value })} placeholder="Optional context" /></label>
        <button className="primary-button" disabled={Boolean(busy)} type="submit">{busy === "accelerator" ? "Adding…" : "Add accelerator"}</button>
      </form>

      <form className="panel discovery-form" onSubmit={addCohort}>
        <div className="panel-heading"><div><span className="step-number">2</span><h2>Add or import cohort</h2></div><span>Optional grouping</span></div>
        <label>Accelerator *<select required value={cohortForm.acceleratorId} onChange={(event) => chooseCohortAccelerator(event.target.value)}><option value="">Choose accelerator</option>{accelerators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="inline-fields"><label>Cohort name *<input required value={cohortForm.name} onChange={(event) => setCohortForm({ ...cohortForm, name: event.target.value })} placeholder="Summer 2026" /></label><label>Year<input type="number" min="1950" max="2100" value={cohortForm.year} onChange={(event) => setCohortForm({ ...cohortForm, year: event.target.value })} /></label></div>
        <label>Cohort portfolio URL *<input required type="url" value={cohortForm.portfolioUrl} onChange={(event) => setCohortForm({ ...cohortForm, portfolioUrl: event.target.value })} placeholder="https://accelerator.example/cohort" /></label>
        <label>Source label<input value={cohortForm.source} onChange={(event) => setCohortForm({ ...cohortForm, source: event.target.value })} /></label>
        <button className="primary-button" disabled={Boolean(busy) || accelerators.length === 0} type="submit">{busy === "cohort" ? "Importing…" : "Add cohort"}</button>
      </form>
    </section>

    <section className="panel discovery-directory">
      <div className="activity-heading"><div><h2>Accelerators and cohorts</h2><p>Run a discovery pass against an accelerator portfolio or a specific cohort page.</p></div><span>{accelerators.length} accelerator{accelerators.length === 1 ? "" : "s"}</span></div>
      {loaded && accelerators.length === 0 ? <div className="table-empty"><h3>No accelerators yet</h3><p>Add the first public accelerator portfolio above.</p></div>
      : <div className="accelerator-list">{accelerators.map((accelerator) => {
        const acceleratorCohorts = cohorts.filter((cohort) => cohort.acceleratorId === accelerator.id);
        return <article className="accelerator-row" key={accelerator.id}>
          <div><span className={`status-pill ${accelerator.status}`}>{accelerator.status}</span><h3>{accelerator.name}</h3><p>{accelerator.description || accelerator.website}</p><a href={accelerator.portfolioUrl} target="_blank" rel="noreferrer">Portfolio source ↗</a></div>
          <button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void discover(accelerator.id, null)}>{busy === `discover:${accelerator.id}` ? "Discovering…" : "Run portfolio discovery"}</button>
          {acceleratorCohorts.length > 0 && <div className="cohort-list">{acceleratorCohorts.map((cohort) => <div key={cohort.id}><span><b>{cohort.name}</b><small>{cohort.year || "Year unknown"} · {cohort.source}</small></span><a href={cohort.portfolioUrl} target="_blank" rel="noreferrer">Source ↗</a><button type="button" disabled={Boolean(busy)} onClick={() => void discover(accelerator.id, cohort.id)}>{busy === `discover:${cohort.id}` ? "Running…" : "Run discovery"}</button></div>)}</div>}
        </article>;
      })}</div>}
    </section>

    <section className="panel activity-panel startup-directory">
      <div className="activity-heading startup-heading"><div><h2>Startup opportunity ranking</h2><p>Each score is paired with confidence, factor explanations, and its supporting evidence.</p></div><div className="discovery-filters ranking-filters"><select aria-label="Filter startups by accelerator" value={filterAccelerator} onChange={(event) => { setFilterAccelerator(event.target.value); setFilterCohort(""); }}><option value="">All accelerators</option>{accelerators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter startups by cohort" value={filterCohort} onChange={(event) => setFilterCohort(event.target.value)}><option value="">All cohorts</option>{availableCohorts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter startups by opportunity tier" value={filterTier} onChange={(event) => setFilterTier(event.target.value as "" | OpportunityTier)}><option value="">All tiers</option><option value="S">S tier · 85+</option><option value="A">A tier · 70–84</option><option value="B">B tier · 55–69</option><option value="C">C tier · below 55</option></select><select aria-label="Sort startup ranking" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="score">Sort: score</option><option value="confidence">Sort: confidence</option><option value="name">Sort: name</option></select></div></div>
      {loaded && startups.length === 0 ? <div className="table-empty"><h3>No startups discovered</h3><p>Run discovery for an accelerator or cohort. Pages with no recognizable company entries return an empty result rather than invented data.</p></div>
      : rankedStartups.length === 0 ? <div className="table-empty"><h3>No startups in this tier</h3><p>Try another tier or research more startups to produce evidence-backed scorecards.</p></div>
      : <div className="startup-list">{rankedStartups.map((startup) => {
        const scorecard = scorecards[startup.id];
        return <article className="startup-row ranked-startup-row" key={startup.id}><div className="startup-main"><span>{startup.name.slice(0, 1).toUpperCase()}</span><div><h3>{startup.name}</h3><p>{startup.description || "No public description was present in the portfolio entry."}</p><small>{startup.domain || "Website not listed"}{startup.location ? ` · ${startup.location}` : ""}</small></div></div><div className="startup-actions">{scorecard ? <div className="ranking-summary"><span className={`tier-badge tier-${scorecard.tier.toLowerCase()}`}>{scorecard.tier}</span><div><b>{scorecard.score}<small>/100</small></b><span>{scorecard.scoreConfidence}% {scorecard.scoreConfidenceLabel} confidence</span></div><details><summary>Score breakdown</summary><div>{scorecard.factors.map((factor) => <p key={factor.dimension}><span><b>{factor.label}</b><small>{factor.reason}</small></span><strong>{factor.earnedPoints}/{factor.maxPoints}</strong></p>)}</div></details></div> : <div className="unscored-summary"><b>Not scored</b><span>Research this startup to create an evidence-backed score.</span></div>}<a className="intelligence-link" href={`/startups/${startup.id}`}>{scorecard ? "View evidence & score →" : "Research startup →"}</a>{startup.website && <a href={startup.website} target="_blank" rel="noreferrer">Website ↗</a>}<details><summary>Inspect discovery sources</summary><div>{startup.provenance.map((source, index) => <p key={`${source.sourceUrl}-${source.cohortId}-${index}`}><a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.cohortName || accelerators.find((item) => item.id === source.acceleratorId)?.name || "Discovery source"} ↗</a><span>{new Date(source.discoveredAt).toLocaleString()}</span></p>)}</div></details></div></article>;
      })}</div>}
    </section>
  </div>;
}
