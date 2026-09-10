import { BookOpen, Briefcase, Calendar, Home, Radio } from "lucide-react";
import type { TabId } from "../data/mock";

const items: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "live", label: "Live", icon: Radio },
  { id: "meetings", label: "Meetings", icon: Calendar },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "resume", label: "Resume", icon: Briefcase },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`nav-item${active === id ? " active" : ""}`}
          onClick={() => onChange(id)}
        >
          <Icon strokeWidth={active === id ? 2.4 : 2} />
          {label}
        </button>
      ))}
    </nav>
  );
}
