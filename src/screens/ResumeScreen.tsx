import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  FileUp,
  GitCompare,
  Sparkles,
  Target,
  FileDown,
} from "lucide-react";
import {
  resumeOriginal,
  resumeTailored,
} from "../data/mock";
import { downloadDocs, downloadPdf } from "../lib/exportFiles";
import { runAi } from "../ai/client";
import { mockMatchResumeToJd, type MatchResult } from "../lib/resumeMatch";

type ResumeStep = "inputs" | "analysis" | "rewrite" | "compare";

export function ResumeScreen() {
  const [step, setStep] = useState<ResumeStep>("inputs");
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [jd, setJd] = useState(
    "Product Engineer for AI meeting assistant. Required: React, TypeScript, RAG, real-time UX, privacy controls. Preferred: speech UX, ATS optimization. Nice: WebRTC, SOC2 familiarity.",
  );
  const [jdFile, setJdFile] = useState<string | null>(null);
  const [role, setRole] = useState("Product Engineer");
  const [level, setLevel] = useState("Senior");
  const [tone, setTone] = useState("Professional");
  const [format, setFormat] = useState<"DOCX" | "PDF">("DOCX");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<"after" | "before">("after");
  const [tailoredText, setTailoredText] = useState(resumeTailored);
  const [parseStatus, setParseStatus] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }

  function uploadResume() {
    setResumeName("Alex_Rivera_Resume.pdf");
    setParseStatus("Parsing resume · extracting SUMMARY / EXPERIENCE / SKILLS…");
    window.setTimeout(() => setParseStatus("Resume parsed · 2 pages · skills graph ready"), 700);
    flash("Resume uploaded · parsing…");
  }

  function uploadJd() {
    setJdFile("Job_Description.docx");
    setJd(
      (prev) =>
        prev ||
        "Product Engineer role requiring React, TypeScript, RAG, and privacy-aware real-time UX.",
    );
    setParseStatus("Parsing job description · requirements + preferred…");
    window.setTimeout(() => setParseStatus((s) => s?.replace("Parsing job", "JD parsed") ?? "JD parsed"), 650);
    flash("Job description uploaded · parsing…");
  }

  async function runTailor() {
    if (!resumeName) {
      flash("Upload a resume first");
      return;
    }
    setBusy(true);
    setParseStatus("Matching resume ↔ JD · scoring keywords…");
    try {
      const result = mockMatchResumeToJd(jd, resumeOriginal);
      setMatch(result);
      const rewritten = await runAi({
        task: "resume-rewrite",
        prompt: `Role: ${role} (${level}). Tone: ${tone}. JD: ${jd}`,
        context: result.tailored,
      });
      setTailoredText(
        rewritten.includes("SUMMARY") || rewritten.includes("Alex") || rewritten.includes("SKILLS")
          ? rewritten
          : result.tailored,
      );
      setParseStatus(
        `Parsed resume ${result.parsedResume.tokens} tok · JD ${result.parsedJd.tokens} tok · match ${result.matchScore}%`,
      );
      setDone(true);
      setStep("analysis");
      flash("Match analysis ready");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Tailor failed");
    } finally {
      setBusy(false);
    }
  }

  function exportResume(kind: "DOCX" | "PDF") {
    const text = view === "before" ? resumeOriginal : tailoredText;
    const base = `CueAI_Resume_${role.replace(/\s+/g, "_")}`;
    if (kind === "PDF") {
      downloadPdf(`${base}.pdf`, `${role} resume`, text);
      flash("PDF downloaded");
    } else {
      downloadDocs(
        `${base}.doc`,
        `${role} resume`,
        `<h1>${role}</h1><pre style="font-family:Calibri,Arial,sans-serif;white-space:pre-wrap;">${text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</pre>`,
      );
      flash("DOCX/Docs file downloaded");
    }
  }

  return (
    <div className="screen section-gap fade-in" style={{ paddingBottom: 110 }}>
      <div style={{ paddingTop: 4 }}>
        <p className="eyebrow">Resume Tailor</p>
        <h1 className="h1">Match the role. Stay truthful.</h1>
        <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Rewrite summary, experience, projects, and skills for ATS — using only your verified background.
        </p>
      </div>

      <div className="resume-steps">
        {(
          [
            ["inputs", "Inputs"],
            ["analysis", "Analysis"],
            ["rewrite", "Rewrite"],
            ["compare", "Compare"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`resume-step${step === id ? " active" : ""}${!done && id !== "inputs" ? " locked" : ""}`}
            onClick={() => {
              if (id === "inputs" || done) setStep(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {step === "inputs" && (
        <>
          <div className="card section-gap">
            <strong style={{ fontSize: 13 }}>Resume upload</strong>
            <button type="button" className="upload-box" onClick={uploadResume}>
              <FileUp size={18} color="var(--teal-bright)" />
              <span>{resumeName ?? "Upload PDF or DOCX"}</span>
              {resumeName && (
                <span className="chip" style={{ fontSize: 10 }}>
                  <CheckCircle2 size={10} /> Parsed
                </span>
              )}
            </button>
          </div>

          <div className="card section-gap">
            <strong style={{ fontSize: 13 }}>Job description</strong>
            <textarea
              className="field textarea"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste job description…"
            />
            <button type="button" className="btn btn-ghost" style={{ width: "100%" }} onClick={uploadJd}>
              <FileUp size={15} />
              {jdFile ? `JD file: ${jdFile}` : "Upload JD (PDF / DOCX)"}
            </button>
          </div>

          <div className="card section-gap">
            <strong style={{ fontSize: 13 }}>Targeting</strong>
            <label className="field-label">
              Target role
              <input className="field" value={role} onChange={(e) => setRole(e.target.value)} />
            </label>
            <div className="row" style={{ gap: 8 }}>
              <label className="field-label grow">
                Experience level
                <select className="field" value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option>Mid</option>
                  <option>Senior</option>
                  <option>Staff</option>
                </select>
              </label>
              <label className="field-label grow">
                Tone
                <select className="field" value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option>Professional</option>
                  <option>Concise</option>
                  <option>Impact-led</option>
                </select>
              </label>
            </div>
            <label className="field-label">
              Output format
              <select
                className="field"
                value={format}
                onChange={(e) => setFormat(e.target.value as "DOCX" | "PDF")}
              >
                <option value="DOCX">DOCX</option>
                <option value="PDF">PDF</option>
              </select>
            </label>
          </div>

          <div className="card" style={{ borderColor: "rgba(0, 153, 255, 0.28)" }}>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Content integrity: CueAI improves wording, structure, and keyword alignment using your
              existing background only — no invented experience.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={() => void runTailor()}
            disabled={busy}
          >
            <Sparkles size={16} />
            {busy ? "Analyzing & rewriting…" : "Analyze & tailor resume"}
          </button>

          {parseStatus && (
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              {parseStatus}
            </p>
          )}
        </>
      )}

      {step === "analysis" && done && match && (
        <>
          <div className="score-card">
            <div>
              <p className="eyebrow">Resume-to-JD match</p>
              <h2 className="h1" style={{ fontSize: 40, marginTop: 4 }}>
                {match.matchScore}%
              </h2>
            </div>
            <Target size={28} color="var(--teal-bright)" />
          </div>

          <div className="card section-gap">
            <strong style={{ fontSize: 13 }}>Parse results (mock)</strong>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Resume: {match.parsedResume.pages} pages · {match.parsedResume.tokens} tokens ·{" "}
              {match.parsedResume.sections.join(", ")}
            </p>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              JD: {match.parsedJd.pages} pages · {match.parsedJd.tokens} tokens ·{" "}
              {match.parsedJd.sections.join(", ")}
            </p>
          </div>

          <TagBlock title="Required skills extracted" items={match.requiredSkills} />
          <TagBlock title="Preferred skills extracted" items={match.preferredSkills} tone="neutral" />
          <TagBlock title="Keyword extraction" items={match.keywords} />
          <TagBlock title="Missing keywords" items={match.missingKeywords} tone="warn" />

          <div className="card section-gap">
            <strong style={{ fontSize: 13 }}>Skills gap analysis</strong>
            <ul className="gap-list">
              {match.skillsGap.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>

          <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={() => setStep("rewrite")}>
            Review rewritten resume
          </button>
        </>
      )}

      {step === "rewrite" && done && (
        <>
          <div className="card section-gap">
            <strong style={{ fontSize: 13 }}>What CueAI rewrote</strong>
            <ul className="gap-list">
              <li>Resume summary rewrite</li>
              <li>Experience bullet rewrite</li>
              <li>Project description rewrite</li>
              <li>Skills section optimization</li>
              <li>ATS keyword optimization · {tone} tone · {level} {role}</li>
            </ul>
          </div>
          <pre className="resume-out">{tailoredText}</pre>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-teal-outline grow"
              onClick={() => {
                navigator.clipboard?.writeText(tailoredText);
                flash("Rewrite copied");
              }}
            >
              <Copy size={15} />
              Copy
            </button>
            <button type="button" className="btn btn-primary grow" onClick={() => setStep("compare")}>
              <GitCompare size={15} />
              Compare
            </button>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={() => exportResume(format)}
          >
            <FileDown size={15} />
            Export as {format}
          </button>
        </>
      )}

      {step === "compare" && done && (
        <>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className={`btn grow${view === "before" ? " btn-primary" : " btn-ghost"}`}
              onClick={() => setView("before")}
            >
              Before
            </button>
            <button
              type="button"
              className={`btn grow${view === "after" ? " btn-primary" : " btn-ghost"}`}
              onClick={() => setView("after")}
            >
              After
            </button>
          </div>
          <pre className="resume-out">{view === "before" ? resumeOriginal : tailoredText}</pre>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Review changes before export. Updates stay aligned with uploaded experience.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-teal-outline grow" onClick={() => exportResume("DOCX")}>
              DOCX
            </button>
            <button type="button" className="btn btn-primary grow" onClick={() => exportResume("PDF")}>
              PDF
            </button>
          </div>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
      <style>{resumeCss}</style>
    </div>
  );
}

function TagBlock({
  title,
  items,
  tone = "teal",
}: {
  title: string;
  items: string[];
  tone?: "teal" | "neutral" | "warn";
}) {
  return (
    <div className="card section-gap">
      <strong style={{ fontSize: 13 }}>{title}</strong>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {items.map((item) => (
          <span
            key={item}
            className={`chip${tone === "neutral" ? " neutral" : ""}${tone === "warn" ? " warn-chip" : ""}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

const resumeCss = `
  .resume-steps {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .resume-step {
    min-height: 34px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 650;
    color: var(--text-dim);
    background: rgba(0,0,0,0.22);
  }
  .resume-step.active {
    color: var(--teal-bright);
    background: var(--teal-soft);
  }
  .resume-step.locked {
    opacity: 0.45;
  }
  .upload-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 18px 12px;
    border-radius: 14px;
    border: 1px dashed rgba(0, 153, 255, 0.4);
    background: rgba(0, 153, 255, 0.06);
    font-size: 13px;
    font-weight: 600;
  }
  .field-label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    font-weight: 650;
    color: var(--text-muted);
  }
  .field-label .field, .field-label select.field {
    font-weight: 500;
    color: var(--text);
  }
  select.field {
    appearance: none;
  }
  .score-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-radius: 18px;
    background: linear-gradient(145deg, rgba(20,184,166,0.18), rgba(15,28,32,0.95));
    border: 1px solid rgba(0, 153, 255, 0.3);
  }
  .gap-list {
    margin: 0;
    padding-left: 18px;
    color: var(--text-muted);
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .resume-out {
    margin: 0;
    padding: 14px;
    border-radius: 16px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    color: var(--text-muted);
    max-height: 280px;
    overflow: auto;
  }
  .warn-chip {
    background: rgba(248, 113, 113, 0.12) !important;
    color: #fecaca !important;
    border-color: rgba(248, 113, 113, 0.3) !important;
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
