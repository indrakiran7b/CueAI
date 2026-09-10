import { useMemo, useState } from "react";
import {
  FileText,
  FileUp,
  Globe,
  Link2,
  MessageCircleQuestion,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  knowledgeDocs as seedDocs,
  type DocCategory,
  type DocFormat,
  type KnowledgeDoc,
} from "../data/mock";
import { runAi } from "../ai/client";
import { formatRagAnswer, mockRetrieve } from "../lib/mockRag";

type KbTab = "search" | "library" | "add";

const uploadTypes: { label: string; format: DocFormat; category: DocCategory }[] = [
  { label: "PDF", format: "PDF", category: "Product" },
  { label: "DOCX", format: "DOCX", category: "Sales" },
  { label: "TXT / MD", format: "MD", category: "Product" },
  { label: "Website URL", format: "URL", category: "Web" },
  { label: "Manual Q&A", format: "Q&A", category: "Q&A" },
];

export function KnowledgeScreen() {
  const [tab, setTab] = useState<KbTab>("search");
  const [docs, setDocs] = useState<KnowledgeDoc[]>(seedDocs);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [filter, setFilter] = useState<DocCategory | "All">("All");
  const [url, setUrl] = useState("");
  const [qaQ, setQaQ] = useState("");
  const [qaA, setQaA] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [categoryPick, setCategoryPick] = useState<DocCategory>("Product");

  const [citations, setCitations] = useState<{ title: string; chunk: string; score: number }[]>([]);

  const filtered = useMemo(
    () => docs.filter((d) => filter === "All" || d.category === filter),
    [docs, filter],
  );

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }

  function ask() {
    const q = query.trim() || "What is Presenter Privacy Mode?";
    setQuery(q);
    setTab("search");
    setAnswer(null);
    const hits = mockRetrieve(q, docs);
    setCitations(hits.map((h) => ({ title: h.title, chunk: h.chunk, score: h.score })));
    const ragText = formatRagAnswer(q, hits);
    void runAi({ task: "knowledge", prompt: q, context: ragText }).then(
      (text) => setAnswer(text),
      (err) => setAnswer(err instanceof Error ? err.message : "Ask failed"),
    );
  }

  function addDoc(partial: Omit<KnowledgeDoc, "id" | "updated" | "snippets" | "status"> & { snippets?: number }) {
    const doc: KnowledgeDoc = {
      id: `k-${Date.now()}`,
      updated: "just now",
      snippets: partial.snippets ?? 8,
      status: "indexing",
      ...partial,
    };
    setDocs((d) => [doc, ...d]);
    window.setTimeout(() => {
      setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, status: "indexed" } : x)));
      flash("Document indexed");
    }, 900);
    setTab("library");
  }

  function simulateUpload(format: DocFormat, category: DocCategory) {
    const titles: Record<DocFormat, string> = {
      PDF: `Product brief ${docs.length + 1}.pdf`,
      DOCX: `Sales playbook ${docs.length + 1}.docx`,
      TXT: `Notes ${docs.length + 1}.txt`,
      MD: `Guide ${docs.length + 1}.md`,
      URL: url || "https://example.com/docs",
      "Q&A": qaQ || "Untitled Q&A",
    };
    addDoc({
      title: titles[format],
      category: format === "URL" ? "Web" : format === "Q&A" ? "Q&A" : category,
      format,
    });
    setUrl("");
    setQaQ("");
    setQaA("");
  }

  return (
    <div className="screen section-gap fade-in">
      <div style={{ paddingTop: 4 }}>
        <p className="eyebrow">Knowledge base</p>
        <h1 className="h1">Index once. Answer with sources.</h1>
        <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Upload PDF/DOCX/TXT/MD, add URLs or Q&A, then search with RAG-backed answers.
        </p>
      </div>

      <div className="kb-tabs">
        {(
          [
            ["search", "Search"],
            ["library", "Library"],
            ["add", "Add sources"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`kb-tab${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <>
          <div className="row" style={{ gap: 8 }}>
            <div className="grow" style={{ position: "relative" }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 12, top: 15, color: "var(--text-dim)" }}
              />
              <input
                className="field"
                style={{ paddingLeft: 36 }}
                placeholder="Semantic search or ask…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
              />
            </div>
            <button type="button" className="btn btn-primary" style={{ padding: "0 14px" }} onClick={ask}>
              <Sparkles size={16} />
            </button>
          </div>

          {answer && (
            <div className="card" style={{ borderColor: "rgba(0, 153, 255, 0.28)" }}>
              <p className="eyebrow">Knowledge-backed answer</p>
              <p className="muted" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 13.5 }}>
                {answer}
              </p>
            </div>
          )}

          {citations.length > 0 && (
            <div className="card section-gap">
              <strong style={{ fontSize: 13 }}>Retrieved chunks (mock RAG)</strong>
              {citations.map((c) => (
                <div key={`${c.title}-${c.score}`} className="rag-hit">
                  <div className="row space-between">
                    <span style={{ fontSize: 12, fontWeight: 650 }}>{c.title}</span>
                    <span className="chip neutral">score {c.score.toFixed(1)}</span>
                  </div>
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                    {c.chunk}
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {docs.filter((d) => d.status === "indexed").length} indexed ·{" "}
            {docs.filter((d) => d.status !== "indexed").length} pending re-index
          </p>
        </>
      )}

      {tab === "library" && (
        <>
          <div className="row" style={{ gap: 6, overflowX: "auto" }}>
            {(["All", "Product", "Sales", "Support FAQ", "Q&A", "Web"] as const).map((c) => (
              <button
                key={c}
                type="button"
                className={`chip${filter === c ? "" : " neutral"}`}
                onClick={() => setFilter(c)}
                style={{ whiteSpace: "nowrap" }}
              >
                {c}
              </button>
            ))}
          </div>

          {filtered.map((doc) => (
            <div key={doc.id} className="card section-gap">
              <div className="row space-between" style={{ alignItems: "flex-start" }}>
                <div className="grow">
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <DocIcon format={doc.format} />
                    <strong style={{ fontSize: 13.5 }}>{doc.title}</strong>
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                    {doc.category} · {doc.format} · {doc.snippets} chunks · {doc.updated}
                  </p>
                </div>
                <span
                  className={`chip${doc.status === "indexed" ? "" : " neutral"}`}
                  style={{ fontSize: 10 }}
                >
                  {doc.status === "indexed"
                    ? "Indexed"
                    : doc.status === "indexing"
                      ? "Indexing…"
                      : "Re-index"}
                </span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-teal-outline grow"
                  style={{ minHeight: 36, fontSize: 12 }}
                  onClick={() => {
                    setDocs((d) =>
                      d.map((x) => (x.id === doc.id ? { ...x, status: "indexing" } : x)),
                    );
                    window.setTimeout(() => {
                      setDocs((d) =>
                        d.map((x) =>
                          x.id === doc.id
                            ? { ...x, status: "indexed", snippets: x.snippets + 2, updated: "just now" }
                            : x,
                        ),
                      );
                      flash("Re-indexed");
                    }, 800);
                  }}
                >
                  <RefreshCw size={14} />
                  Re-index
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 36, padding: "0 12px" }}
                  onClick={() => {
                    setDocs((d) => d.filter((x) => x.id !== doc.id));
                    flash("Document deleted");
                  }}
                  aria-label="Delete document"
                >
                  <Trash2 size={15} color="var(--danger)" />
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "add" && (
        <>
          <div className="card section-gap">
            <strong style={{ fontSize: 13 }}>Upload files</strong>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              PDF, DOCX, TXT, or Markdown — stored as product, sales, or support docs.
            </p>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {(["Product", "Sales", "Support FAQ"] as DocCategory[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`chip${categoryPick === c ? "" : " neutral"}`}
                  onClick={() => setCategoryPick(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="upload-grid">
              {uploadTypes
                .filter((u) => u.format === "PDF" || u.format === "DOCX" || u.format === "MD")
                .map((u) => (
                  <button
                    key={u.label}
                    type="button"
                    className="upload-tile"
                    onClick={() => simulateUpload(u.format, categoryPick)}
                  >
                    <FileUp size={16} color="var(--teal-bright)" />
                    {u.label}
                  </button>
                ))}
            </div>
          </div>

          <div className="card section-gap">
            <div className="row">
              <Globe size={15} color="var(--teal-bright)" />
              <strong style={{ fontSize: 13 }}>Add website URL</strong>
            </div>
            <input
              className="field"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={() => simulateUpload("URL", "Web")}
              disabled={!url.trim()}
            >
              <Link2 size={15} />
              Index URL
            </button>
          </div>

          <div className="card section-gap">
            <div className="row">
              <MessageCircleQuestion size={15} color="var(--teal-bright)" />
              <strong style={{ fontSize: 13 }}>Manual Q&A entry</strong>
            </div>
            <input
              className="field"
              placeholder="Question"
              value={qaQ}
              onChange={(e) => setQaQ(e.target.value)}
            />
            <textarea
              className="field textarea"
              placeholder="Answer"
              value={qaA}
              onChange={(e) => setQaA(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-teal-outline"
              style={{ width: "100%" }}
              disabled={!qaQ.trim() || !qaA.trim()}
              onClick={() => {
                addDoc({
                  title: `Q&A: ${qaQ.trim()}`,
                  category: "Q&A",
                  format: "Q&A",
                  snippets: 2,
                });
                setQaQ("");
                setQaA("");
              }}
            >
              Save Q&A
            </button>
          </div>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
      <style>{kbCss}</style>
    </div>
  );
}

function DocIcon({ format }: { format: DocFormat }) {
  if (format === "URL") return <Globe size={14} color="var(--teal-bright)" />;
  if (format === "Q&A") return <MessageCircleQuestion size={14} color="var(--teal-bright)" />;
  return <FileText size={14} color="var(--teal-bright)" />;
}

const kbCss = `
  .kb-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 4px;
    border-radius: 14px;
    background: rgba(0,0,0,0.25);
    border: 1px solid var(--border);
  }
  .kb-tab {
    min-height: 36px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-muted);
  }
  .kb-tab.active {
    background: var(--teal-soft);
    color: var(--teal-bright);
  }
  .upload-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .upload-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 8px;
    border-radius: 14px;
    background: rgba(0,0,0,0.22);
    border: 1px dashed rgba(0, 153, 255, 0.35);
    font-size: 11px;
    font-weight: 650;
  }
  .rag-hit {
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .rag-hit:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .toast {
    position: sticky;
    bottom: 8px;
    text-align: center;
    padding: 10px;
    border-radius: 12px;
    background: #ffffff;
    color: #090909;
    font-weight: 700;
    font-size: 12px;
  }
`;
