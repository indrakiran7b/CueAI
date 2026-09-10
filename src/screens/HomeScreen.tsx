import { ArrowRight, BookOpen, Briefcase, Calendar, Mic, Shield } from "lucide-react";
import { CueLogo } from "../components/CueLogo";
import { meetings, type TabId } from "../data/mock";

export function HomeScreen({
  onNavigate,
  onStartOverlay,
}: {
  onNavigate: (tab: TabId) => void;
  onStartOverlay: () => void;
}) {
  const live = meetings.find((m) => m.status === "live");

  return (
    <div className="screen section-gap fade-in">
      <header className="row space-between" style={{ paddingTop: 4 }}>
        <div className="brand-mark" style={{ fontSize: 18 }}>
          <span className="logo">
            <CueLogo size={16} />
          </span>
          CueAI
        </div>
        <button type="button" className="chip" onClick={() => onNavigate("settings")}>
          <Shield size={12} />
          Consent on
        </button>
      </header>

      <div>
        <p className="eyebrow">Today</p>
        <h1 className="h1">CueAI is ready for your next call.</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Transparent overlay assist, screen context, meetings, translation, and resume tailor — built for professional use.
        </p>
      </div>

      {live && (
        <button type="button" className="live-hero" onClick={onStartOverlay}>
          <div className="live-hero-bg" />
          <h2 className="h2" style={{ position: "relative", marginTop: 0 }}>
            {live.title}
          </h2>
          <p className="muted" style={{ position: "relative", margin: "6px 0 14px", fontSize: 13 }}>
            {live.time} · {live.participants.join(" · ")}
          </p>
          <span className="btn btn-primary" style={{ position: "relative", width: "100%" }}>
            <Mic size={16} />
            Start overlay window
            <ArrowRight size={16} />
          </span>
        </button>
      )}

      <div className="quick-grid">
        <button type="button" className="quick-card" onClick={() => onNavigate("meetings")}>
          <Calendar size={18} color="var(--teal-bright)" />
          <strong>Meetings</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            Summaries · transcript
          </span>
        </button>
        <button type="button" className="quick-card" onClick={() => onNavigate("knowledge")}>
          <BookOpen size={18} color="var(--teal-bright)" />
          <strong>Knowledge</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            Upload · search · RAG
          </span>
        </button>
        <button type="button" className="quick-card" onClick={() => onNavigate("resume")}>
          <Briefcase size={18} color="var(--teal-bright)" />
          <strong>Resume Tailor</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            JD match · ATS export
          </span>
        </button>
        <button type="button" className="quick-card" onClick={() => onNavigate("settings")}>
          <Shield size={18} color="var(--teal-bright)" />
          <strong>Privacy</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            Presenter mode
          </span>
        </button>
      </div>

      <section className="section-gap">
        <div className="row space-between">
          <h2 className="h2">Up next</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            2 scheduled
          </span>
        </div>
        {meetings
          .filter((m) => m.status !== "live")
          .map((m) => (
            <button
              key={m.id}
              type="button"
              className="card row space-between"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => onNavigate("meetings")}
            >
              <div className="grow">
                <strong style={{ fontSize: 14 }}>{m.title}</strong>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                  {m.time} · {m.platform}
                </p>
              </div>
              <span className={`chip${m.status === "done" ? " neutral" : ""}`}>
                {m.status === "upcoming" ? "Soon" : "Done"}
              </span>
            </button>
          ))}
      </section>

      <style>{`
        .live-hero {
          text-align: left;
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          padding: 16px;
          border: 1px solid rgba(0, 153, 255, 0.28);
          background: linear-gradient(160deg, rgba(0, 153, 255, 0.14), rgba(20, 20, 20, 0.92));
        }
        .live-hero-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 90% 10%, rgba(0, 153, 255, 0.22), transparent 40%),
            repeating-linear-gradient(
              -18deg,
              transparent,
              transparent 10px,
              rgba(255, 255, 255, 0.015) 10px,
              rgba(255, 255, 255, 0.015) 11px
            );
        }
        .quick-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .quick-card {
          text-align: left;
          padding: 14px;
          border-radius: 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .quick-card strong {
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
