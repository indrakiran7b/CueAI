import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle2,
  FileText,
  Filter,
  HelpCircle,
  Mail,
  MessageSquareText,
  Search,
  Video,
} from "lucide-react";
import {
  meetingHistory,
  type ActionItem,
  type MeetingRecord,
  type MeetingRecordStatus,
} from "../data/mock";
import { downloadDocs, downloadPdf, meetingExportHtml, meetingExportPlain } from "../lib/exportFiles";
import { listMemories } from "../lib/sessionMemory";

type FilterId = "all" | MeetingRecordStatus;
type DetailView = "summary" | "transcription";

export function MeetingsScreen({ onNewLiveSession }: { onNewLiveSession: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<DetailView>("summary");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const memories = listMemories();
  const [actionsById, setActionsById] = useState(() =>
    Object.fromEntries(meetingHistory.map((m) => [m.id, m.actions.map((a) => ({ ...a }))])),
  );

  const selected = meetingHistory.find((m) => m.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meetingHistory.filter((m) => {
      if (filter !== "all" && m.status !== filter) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        m.platform.toLowerCase().includes(q)
      );
    });
  }, [query, filter]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }

  function toggleAction(meetingId: string, index: number) {
    setActionsById((prev) => {
      const list = prev[meetingId].map((a, i) => (i === index ? { ...a, done: !a.done } : a));
      return { ...prev, [meetingId]: list };
    });
  }

  function openMeeting(id: string) {
    setSelectedId(id);
    setDetailView("summary");
  }

  if (selected) {
    const actions = actionsById[selected.id] ?? selected.actions;
    const payload = { ...selected, actions };

    return (
      <MeetingDetail
        meeting={selected}
        actions={actions}
        view={detailView}
        toast={toast}
        onBack={() => {
          if (detailView === "transcription") {
            setDetailView("summary");
            return;
          }
          setSelectedId(null);
          setDetailView("summary");
        }}
        onOpenTranscription={() => setDetailView("transcription")}
        onToggleAction={(i) => toggleAction(selected.id, i)}
        onExportPdf={() => {
          downloadPdf(`${slug(selected.title)}.pdf`, selected.title, meetingExportPlain(payload));
          flash("PDF downloaded");
        }}
        onExportDocs={() => {
          downloadDocs(`${slug(selected.title)}.doc`, selected.title, meetingExportHtml(payload));
          flash("Docs file downloaded");
        }}
        onCopyEmail={() => {
          void navigator.clipboard?.writeText(selected.followUpEmail);
          flash("Follow-up email copied");
        }}
      />
    );
  }

  return (
    <div className="screen section-gap fade-in meetings-screen" style={{ paddingBottom: 110 }}>
      <header className="meetings-header">
        <div className="grow">
          <h1 className="h1">Meetings</h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Live sessions, recordings, and AI summaries in one place.
          </p>
        </div>
        <button type="button" className="btn btn-teal-outline meetings-new" onClick={onNewLiveSession}>
          <Video size={14} />
          New live session
        </button>
      </header>

      <div className="meetings-search-row">
        <label className="meetings-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings..."
            aria-label="Search meetings"
          />
        </label>
        <button
          type="button"
          className={`btn btn-ghost meetings-filter-btn${filtersOpen ? " active" : ""}`}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Filter size={14} />
          Filters
        </button>
      </div>

      {filtersOpen && (
        <div className="meetings-filters">
          {(
            [
              { id: "all", label: "All" },
              { id: "live", label: "Live" },
              { id: "summary-ready", label: "Summary ready" },
            ] as { id: FilterId; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`chip${filter === f.id ? "" : " neutral"}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {memories.length > 0 && (
        <div className="card section-gap">
          <div className="row" style={{ gap: 8 }}>
            <Brain size={16} color="var(--teal-bright)" />
            <strong style={{ fontSize: 13 }}>Recent live context memory</strong>
          </div>
          {memories.slice(0, 2).map((m) => (
            <p key={m.sessionId} className="muted" style={{ margin: 0, fontSize: 12 }}>
              {new Date(m.startedAt).toLocaleString()} · {m.host} · {m.facts.length} facts
            </p>
          ))}
        </div>
      )}

      <div className="meetings-list">
        {filtered.map((m) => (
          <button key={m.id} type="button" className="meeting-card" onClick={() => openMeeting(m.id)}>
            <div className="row space-between" style={{ marginBottom: 10 }}>
              <span className="meeting-card-icon">
                <Video size={16} />
              </span>
              <StatusBadge status={m.status} />
            </div>
            <strong className="meeting-card-title">{m.title}</strong>
            <p className="muted meeting-card-meta">
              {m.day} · {m.time} · {m.duration} · {m.attendees} attendees
            </p>
            <div className="meeting-tags">
              {m.tags.map((tag) => (
                <span key={tag} className="meeting-tag">
                  {tag}
                </span>
              ))}
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="card">
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              No meetings match your search.
            </p>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
      <style>{meetingsCss}</style>
    </div>
  );
}

function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function StatusBadge({ status }: { status: MeetingRecordStatus }) {
  if (status === "live") {
    return (
      <span className="chip meeting-live-badge">
        <span className="live-dot" />
        Live
      </span>
    );
  }
  return <span className="chip neutral">Summary ready</span>;
}

function ExportButtons({ onExportPdf, onExportDocs }: { onExportPdf: () => void; onExportDocs: () => void }) {
  return (
    <div className="meetings-export">
      <button type="button" className="btn btn-primary" onClick={onExportPdf}>
        <FileText size={16} />
        Export PDF
      </button>
      <button type="button" className="btn btn-teal-outline" onClick={onExportDocs}>
        <FileText size={16} />
        Export Docs
      </button>
    </div>
  );
}

function MeetingDetail({
  meeting,
  actions,
  view,
  toast,
  onBack,
  onOpenTranscription,
  onToggleAction,
  onExportPdf,
  onExportDocs,
  onCopyEmail,
}: {
  meeting: MeetingRecord;
  actions: ActionItem[];
  view: DetailView;
  toast: string | null;
  onBack: () => void;
  onOpenTranscription: () => void;
  onToggleAction: (index: number) => void;
  onExportPdf: () => void;
  onExportDocs: () => void;
  onCopyEmail: () => void;
}) {
  if (view === "transcription") {
    return (
      <div className="screen section-gap fade-in meetings-screen" style={{ paddingBottom: 120 }}>
        <button type="button" className="meetings-back" onClick={onBack}>
          <ArrowLeft size={16} />
          Summary
        </button>

        <div>
          <p className="eyebrow">Transcription</p>
          <h1 className="h1">{meeting.title}</h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            {meeting.day} · {meeting.duration} · {meeting.platform} · {meeting.attendees} attendees
          </p>
        </div>

        <section className="card meetings-section">
          <div className="row space-between" style={{ marginBottom: 10 }}>
            <h2 className="h2" style={{ margin: 0 }}>
              Full transcript
            </h2>
            <span className="chip neutral">{meeting.platform}</span>
          </div>
          <pre className="meetings-transcript meetings-transcript-full">{meeting.transcript}</pre>
        </section>

        <ExportButtons onExportPdf={onExportPdf} onExportDocs={onExportDocs} />

        {toast && <div className="toast">{toast}</div>}
        <style>{meetingsCss}</style>
      </div>
    );
  }

  const openCount = actions.filter((a) => !a.done).length;

  return (
    <div className="screen section-gap fade-in meetings-screen" style={{ paddingBottom: 120 }}>
      <button type="button" className="meetings-back" onClick={onBack}>
        <ArrowLeft size={16} />
        Meetings
      </button>

      <div className="row space-between" style={{ alignItems: "flex-start", gap: 10 }}>
        <div className="grow">
          <StatusBadge status={meeting.status} />
          <h1 className="h1" style={{ marginTop: 10 }}>
            {meeting.title}
          </h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            {meeting.day} · {meeting.duration} · {meeting.attendees} attendees
            {meeting.generatedIn ? ` · Generated in ${meeting.generatedIn}` : ""}
          </p>
        </div>
      </div>

      <div className="meetings-detail-actions">
        <button type="button" className="btn btn-teal-outline meetings-feed-btn" onClick={onOpenTranscription}>
          <MessageSquareText size={14} />
          Transcription
        </button>
      </div>

      <section className="card meetings-section">
        <h2 className="h2">Executive summary</h2>
        <p className="meetings-body">{meeting.executiveSummary}</p>
      </section>

      <div className="meetings-two-col">
        <section className="card meetings-section">
          <h2 className="h2">Key decisions</h2>
          <ul className="meetings-decision-list">
            {meeting.decisions.map((d) => (
              <li key={d}>
                <CheckCircle2 size={16} color="var(--teal-bright)" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card meetings-section">
          <div className="row space-between" style={{ marginBottom: 8 }}>
            <h2 className="h2" style={{ margin: 0 }}>
              Risks & open questions
            </h2>
          </div>
          <p className="muted" style={{ margin: "0 0 10px", fontSize: 12 }}>
            Needs follow-up
          </p>
          <ul className="meetings-risk-list">
            {meeting.risks.map((r) => (
              <li key={r}>
                <AlertTriangle size={16} color="var(--warn)" />
                <span>
                  <strong>Risk</strong> · {r}
                </span>
              </li>
            ))}
            {meeting.openQuestions.map((q) => (
              <li key={q}>
                <HelpCircle size={16} color="#a78bfa" />
                <span>
                  <strong>Question</strong> · {q}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card meetings-section">
        <div className="row space-between" style={{ marginBottom: 12 }}>
          <h2 className="h2" style={{ margin: 0 }}>
            Action items
          </h2>
          <span className="chip neutral">{openCount} open</span>
        </div>
        <div className="actions-table">
          <div className="actions-row head">
            <span>Task</span>
            <span>Owner</span>
            <span>Due</span>
            <span>Status</span>
          </div>
          {actions.map((a, i) => (
            <button key={`${a.text}-${i}`} type="button" className="actions-row" onClick={() => onToggleAction(i)}>
              <span className="actions-task">{a.text}</span>
              <span className="muted">{a.owner}</span>
              <span className="muted">{a.due}</span>
              <span className={`chip${a.done ? "" : " warn"}`}>{a.done ? "Done" : "Open"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card meetings-section">
        <div className="row space-between" style={{ marginBottom: 10 }}>
          <h2 className="h2" style={{ margin: 0 }}>
            Follow-up email draft
          </h2>
          <button type="button" className="chip" onClick={onCopyEmail}>
            <Mail size={12} />
            Copy
          </button>
        </div>
        <pre className="meetings-email">{meeting.followUpEmail}</pre>
      </section>

      <ExportButtons onExportPdf={onExportPdf} onExportDocs={onExportDocs} />

      {toast && <div className="toast">{toast}</div>}
      <style>{meetingsCss}</style>
    </div>
  );
}

const meetingsCss = `
  .meetings-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .meetings-new {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 12px;
    white-space: nowrap;
  }
  .meetings-search-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .meetings-search {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    color: var(--text-muted);
  }
  .meetings-search input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    color: var(--text);
    min-width: 0;
  }
  .meetings-filter-btn {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    font-size: 12px;
  }
  .meetings-filter-btn.active {
    border-color: var(--border-strong);
    color: var(--teal-bright);
  }
  .meetings-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .meetings-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .meeting-card {
    text-align: left;
    padding: 14px;
    border-radius: var(--radius);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }
  .meeting-card-icon {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: var(--teal-soft);
    color: var(--teal-bright);
  }
  .meeting-card-title {
    display: block;
    font-family: var(--font-display);
    font-size: 16px;
    margin-bottom: 6px;
  }
  .meeting-card-meta {
    margin: 0 0 10px;
    font-size: 12px;
  }
  .meeting-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .meeting-tag {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid rgba(0, 153, 255, 0.35);
    color: var(--teal-bright);
  }
  .meeting-live-badge {
    background: rgba(248, 113, 113, 0.12);
    border-color: rgba(248, 113, 113, 0.35);
    color: #fecaca;
  }
  .meetings-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 13px;
    padding: 0;
  }
  .meetings-detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .meetings-feed-btn {
    padding: 8px 12px;
    font-size: 12px;
  }
  .meetings-section h2 {
    margin: 0 0 10px;
    font-size: 15px;
  }
  .meetings-body {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--text);
  }
  .meetings-two-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .meetings-decision-list,
  .meetings-risk-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .meetings-decision-list li,
  .meetings-risk-list li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 1.45;
  }
  .meetings-decision-list li svg,
  .meetings-risk-list li svg {
    flex-shrink: 0;
    margin-top: 2px;
  }
  .actions-table {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .actions-row {
    display: grid;
    grid-template-columns: 1.4fr 0.8fr 0.55fr 0.55fr;
    gap: 6px;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    text-align: left;
    width: 100%;
    font-size: 12px;
  }
  .actions-row.head {
    padding-top: 0;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10px;
    border-bottom-color: rgba(255, 255, 255, 0.12);
  }
  .actions-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .actions-task {
    font-weight: 600;
    line-height: 1.35;
  }
  .chip.warn {
    background: rgba(251, 191, 36, 0.12);
    border-color: rgba(251, 191, 36, 0.4);
    color: #fde68a;
  }
  .meetings-transcript,
  .meetings-email {
    margin: 0;
    white-space: pre-wrap;
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.55;
    color: var(--text-muted);
    max-height: 280px;
    overflow: auto;
  }
  .meetings-transcript-full {
    max-height: none;
    font-size: 13px;
    color: var(--text);
  }
  .meetings-export {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 88px;
    transform: translateX(-50%);
    z-index: 80;
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(15, 28, 32, 0.95);
    border: 1px solid var(--border-strong);
    color: var(--text);
    font-size: 12px;
    white-space: nowrap;
    box-shadow: var(--shadow);
  }
`;
