"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MailboxSummary, OutreachStatus, StartupOutreachRow } from "@/lib/mailbox";

type MailboxPayload = {
  generatedAt: string;
  window: string;
  summary: MailboxSummary;
  rows: StartupOutreachRow[];
};

type Filter = "all" | OutreachStatus;

const STATUS_LABELS: Record<OutreachStatus, string> = {
  replied: "Replied",
  seen: "Seen",
  not_replied: "Not replied",
  delivery_failed: "Mail delivery subsystem",
};

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function openLabel(row: StartupOutreachRow) {
  if (row.status === "replied") return "Reply confirms it was seen";
  if (row.openStatus === "observed") return `Open observed ${formatTime(row.firstOpenedAt)}`;
  if (row.openStatus === "not_observed") return "No open observed";
  return "Open status unknown";
}

export default function MailboxView({ gmailToken, gmailConnected, onConnect }: {
  gmailToken: string;
  gmailConnected: boolean;
  onConnect: () => void;
}) {
  const [mailbox, setMailbox] = useState<MailboxPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const loadMailbox = useCallback(async () => {
    if (!gmailToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/mailbox", { headers: { Authorization: `Bearer ${gmailToken}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The outreach list could not be loaded.");
      setMailbox(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The outreach list could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [gmailToken]);

  useEffect(() => {
    if (!gmailToken) return;
    const timer = window.setTimeout(() => void loadMailbox(), 0);
    return () => window.clearTimeout(timer);
  }, [gmailToken, loadMailbox]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (mailbox?.rows || []).filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!needle) return true;
      return `${row.companyName} ${row.recipientName} ${row.recipientEmail} ${row.subject}`.toLowerCase().includes(needle);
    });
  }, [filter, mailbox?.rows, query]);

  const filterOptions: Array<{ value: Filter; label: string; count: number }> = [
    { value: "all", label: "All", count: mailbox?.summary.total || 0 },
    { value: "replied", label: "Replied", count: mailbox?.summary.replied || 0 },
    { value: "seen", label: "Seen", count: mailbox?.summary.seen || 0 },
    { value: "not_replied", label: "Not replied", count: mailbox?.summary.notReplied || 0 },
    { value: "delivery_failed", label: "Delivery failures", count: mailbox?.summary.deliveryFailed || 0 },
  ];

  return <div className="page-wrap mailbox-page">
    <header className="analytics-heading mailbox-heading">
      <div><p className="kicker">Startup outreach</p><h1>Outreach status</h1><p>A simple list of the startups you emailed and what happened next.</p></div>
      <button className="secondary-button" type="button" onClick={() => void loadMailbox()} disabled={!gmailConnected || loading}>{loading ? "Checking Gmail…" : "Refresh mailbox"}</button>
    </header>

    <div className="accuracy-note"><b>Seen is approximate:</b> tracked-image loads can come from mail proxies or security scanners. Gmail-only messages show “open status unknown,” because Gmail does not expose reliable read receipts.</div>

    {!gmailConnected ? <section className="panel analytics-empty"><span>◎</span><h2>Connect Gmail to build the outreach list</h2><p>The app requests read-only mailbox access to classify sent outreach, replies, and delivery failures. It does not modify your mailbox.</p><button className="primary-button compact" type="button" onClick={onConnect}>Connect Gmail</button></section>
    : error ? <section className="panel analytics-empty"><h2>Mailbox review needs permission</h2><p>{error}</p><button className="primary-button compact" type="button" onClick={onConnect}>Reconnect Gmail</button></section>
    : <>
      <section className="mailbox-metrics" aria-label="Outreach status counts">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button"><span>All outreach</span><b>{mailbox?.summary.total || 0}</b></button>
        <button className={filter === "replied" ? "active" : ""} onClick={() => setFilter("replied")} type="button"><span>Replied</span><b>{mailbox?.summary.replied || 0}</b></button>
        <button className={filter === "seen" ? "active" : ""} onClick={() => setFilter("seen")} type="button"><span>Seen</span><b>{mailbox?.summary.seen || 0}</b></button>
        <button className={filter === "not_replied" ? "active" : ""} onClick={() => setFilter("not_replied")} type="button"><span>Not replied</span><b>{mailbox?.summary.notReplied || 0}</b></button>
        <button className={filter === "delivery_failed" ? "active" : ""} onClick={() => setFilter("delivery_failed")} type="button"><span>Delivery failures</span><b>{mailbox?.summary.deliveryFailed || 0}</b></button>
      </section>

      <section className="panel mailbox-panel">
        <div className="mailbox-controls">
          <div><h2>Startup contacts</h2><p>{mailbox ? `${mailbox.window} · updated ${formatTime(mailbox.generatedAt)}` : loading ? "Checking Gmail…" : "Waiting for Gmail"}</p></div>
          <label><span className="sr-only">Search outreach</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search startup, recipient, or subject" /></label>
        </div>
        <div className="mailbox-filters" aria-label="Filter outreach status">{filterOptions.map((option) => <button className={filter === option.value ? "active" : ""} key={option.value} onClick={() => setFilter(option.value)} type="button">{option.label}<span>{option.count}</span></button>)}</div>
        {loading && !mailbox ? <div className="table-empty"><h3>Reading outreach threads</h3><p>Checking sent mail, replies, tracked opens, and delivery notices.</p></div>
        : visibleRows.length === 0 ? <div className="table-empty"><h3>No matching outreach</h3><p>Try another status or clear the search.</p></div>
        : <div className="mailbox-list">{visibleRows.map((row) => <article className="mailbox-row" key={row.id}>
          <div className="mailbox-company"><span>{row.companyName.slice(0, 1).toUpperCase()}</span><div><b>{row.companyName}</b><small>{row.recipientName || row.recipientEmail}</small><small>{row.recipientEmail}</small></div></div>
          <div className="mailbox-subject"><b>{row.subject}</b><small>Sent {formatTime(row.sentAt)} · {row.sentCount > 1 ? `${row.sentCount} sent messages` : "1 sent message"}</small></div>
          <div className="mailbox-signal"><span className={`mailbox-status status-${row.status}`}>{STATUS_LABELS[row.status]}</span><small>{row.status === "delivery_failed" ? row.bounceReason : row.status === "replied" ? `Replied ${formatTime(row.repliedAt)}` : openLabel(row)}</small></div>
          <div className="mailbox-activity"><span>Last activity</span><b>{formatTime(row.lastActivityAt)}</b><small>{row.tracked ? "Platform tracked" : "Gmail imported"}</small></div>
        </article>)}</div>}
      </section>
      {mailbox && mailbox.summary.openUnknown > 0 && <p className="mailbox-footnote">{mailbox.summary.openUnknown} message{mailbox.summary.openUnknown === 1 ? " has" : "s have"} unknown open status because they were sent outside Aksh Outreach or without tracking.</p>}
    </>}
  </div>;
}
